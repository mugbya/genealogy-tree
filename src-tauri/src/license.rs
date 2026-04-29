use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use sha2::{Sha256, Digest};
use sysinfo::System;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use hmac::{Hmac, Mac};

// License configuration keys
pub const CONFIG_LICENSE_MACHINE_CODE: &str = "license_machine_code";
pub const CONFIG_LICENSE_KEY: &str = "license_key";
pub const CONFIG_LICENSE_TYPE: &str = "license_type";
pub const CONFIG_LICENSE_ACTIVATED_AT: &str = "license_activated_at";
pub const CONFIG_LICENSE_EXPIRES_AT: &str = "license_expires_at";
pub const CONFIG_LICENSE_VERIFIED_AT: &str = "license_verified_at";
pub const CONFIG_TRIAL_FIRST_USE: &str = "trial_first_use";  // 首次使用时间戳
pub const CONFIG_TRIAL_GENERATED: &str = "trial_generated";  // 是否已生成试用授权

// License secret key (must match server)
const LICENSE_SECRET_KEY: &str = "genealogy-license-secret-key-32byte!";

// Trial license constants
const TRIAL_DAYS: i64 = 30;

// 授权服务器地址（代码层面配置）
use crate::constants::LICENSE_SERVER_URL;

type HmacSha256 = Hmac<Sha256>;

/// License data decoded from encoded license key
#[derive(Debug, Clone)]
pub struct LicenseData {
    pub key: String,
    pub license_type: String,
    pub exp: i64,  // Unix timestamp, 0 means permanent
}

/// Features that require license authorization
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LicenseFeature {
    ExportHtml,
    ExportWord,
    ExportVolume,
}

impl LicenseFeature {
    pub fn requires_license(&self) -> bool {
        match self {
            LicenseFeature::ExportHtml => true,
            LicenseFeature::ExportWord => true,
            LicenseFeature::ExportVolume => true,
        }
    }
}

/// Decode license key and verify HMAC signature
/// Supports GLY- (year), GLT- (trial), GLC- (custom), GLP- (permanent)
/// Returns LicenseData if valid, None if invalid
/// Note: Short format codes (GLT-XXXX-XXXX-XXXX-XXXX) cannot be decoded locally,
/// they need server verification. For trial, expiry is calculated from trial_first_use.
fn decode_license(encoded: &str) -> Option<LicenseData> {
    // Short format detection: GLX-XXXX-XXXX-XXXX-XXXX (4 groups of 4 chars)
    let is_short_format = encoded.len() == 19 &&
        encoded.chars().filter(|c| *c == '-').count() == 4;

    if is_short_format {
        // Short format cannot be decoded locally - requires server verification
        // For trial license, expiry is calculated from stored trial_first_use
        return None;
    }

    // Base64 encoded format - try to decode
    let data_part = if encoded.starts_with("GLY-") {
        encoded.strip_prefix("GLY-")?
    } else if encoded.starts_with("GLT-") {
        encoded.strip_prefix("GLT-")?
    } else if encoded.starts_with("GLC-") {
        encoded.strip_prefix("GLC-")?
    } else if encoded.starts_with("GLP-") {
        encoded.strip_prefix("GLP-")?
    } else {
        return None;
    };

    // Base64 decode
    let decoded = BASE64.decode(data_part).ok()?;

    // Parse as string
    let json_str = String::from_utf8(decoded).ok()?;

    // Parse JSON: format is {"key":"...","type":"...","exp":123456,"sig":"..."}
    let json: serde_json::Value = serde_json::from_str(&json_str).ok()?;

    let key = json.get("key")?.as_str()?.to_string();
    let license_type = json.get("type")?.as_str()?.to_string();
    let exp = json.get("exp")?.as_i64()?;
    let sig = json.get("sig")?.as_str()?.to_string();

    // Verify HMAC signature - recompute from the data fields
    let data_for_sig = format!(r#"{{"key":"{}","type":"{}","exp":{}}}"#, key, license_type, exp);
    let mut mac = HmacSha256::new_from_slice(LICENSE_SECRET_KEY.as_bytes()).ok()?;
    mac.update(data_for_sig.as_bytes());
    let expected_sig = hex::encode(mac.finalize().into_bytes());

    if sig != expected_sig {
        eprintln!("[License] HMAC signature mismatch");
        return None;
    }

    Some(LicenseData {
        key,
        license_type,
        exp,
    })
}

/// Generate a random 4-character uppercase alphanumeric string
fn generate_random_part() -> String {
    use rand::Rng;
    let chars: Vec<char> = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".chars().collect();
    let mut rng = rand::thread_rng();
    (0..4).map(|_| chars[rng.gen_range(0..chars.len())]).collect()
}

/// Request trial license from server
/// Returns (license_key, expires_at)
pub async fn request_trial_license_from_server(machine_code: &str) -> Result<(String, String), String> {
    let client = Client::new();

    #[derive(Deserialize)]
    struct TrialResponse {
        success: bool,
        data: Option<TrialData>,
        error: Option<String>,
    }

    #[derive(Deserialize)]
    struct TrialData {
        license_key: String,
        license_type: String,
        expires_at: Option<String>,
        is_existing: bool,
    }

    let response = client
        .post(&format!("{}/api/license/trial", LICENSE_SERVER_URL))
        .query(&[("machine_code", machine_code)])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err("请求试用授权失败，请检查网络连接".to_string());
    }

    let result: TrialResponse = response.json().await.map_err(|e| e.to_string())?;

    if result.success {
        if let Some(data) = result.data {
            println!("[License] Trial license: {} (is_existing: {})",
                     data.license_key, data.is_existing);
            return Ok((
                data.license_key,
                data.expires_at.unwrap_or_else(|| "2099-12-31 23:59:59".to_string())
            ));
        }
    }

    Err(result.error.unwrap_or_else(|| "获取试用授权失败".to_string()))
}

/// Get or create trial license from server
/// This function is async because it needs to call the license server
/// Trial licenses are auto-activated (no manual activation needed)
pub async fn get_or_generate_trial_license_async(db: Arc<Mutex<Connection>>) -> Result<(String, String), String> {
    // Get machine code
    let machine_code = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let existing = conn.query_row(
            "SELECT value FROM family_config WHERE key = ?",
            [CONFIG_LICENSE_MACHINE_CODE],
            |row| row.get::<_, String>(0)
        ).ok();

        match existing {
            Some(code) => code,
            None => {
                let code = generate_machine_code();
                let _ = conn.execute(
                    "INSERT INTO family_config (key, value) VALUES (?1, ?2)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    [CONFIG_LICENSE_MACHINE_CODE, &code]
                );
                code
            }
        }
    };

    // Request trial from server
    let (trial_key, expires_at) = request_trial_license_from_server(&machine_code).await?;

    // Auto-activate: store to database with activated_at timestamp
    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

        let _ = conn.execute(
            "INSERT INTO family_config (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [CONFIG_LICENSE_KEY, &trial_key]
        );
        let _ = conn.execute(
            "INSERT INTO family_config (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [CONFIG_LICENSE_TYPE, "trial"]
        );
        let _ = conn.execute(
            "INSERT INTO family_config (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [CONFIG_LICENSE_EXPIRES_AT, &expires_at]
        );
        let _ = conn.execute(
            "INSERT INTO family_config (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [CONFIG_LICENSE_ACTIVATED_AT, &now]
        );
    }

    println!("[License] Trial auto-activated: {} (expires: {})", trial_key, expires_at);

    Ok((trial_key, expires_at))
}

/// Check if a license key is valid (not expired)
/// The license_key should be the stored encoded license key
pub fn is_license_valid(license_key: Option<&str>, stored_expires_at: Option<&str>, license_type: Option<&str>) -> bool {
    let Some(key) = license_key else {
        eprintln!("[License] is_license_valid: no license_key");
        return false;
    };

    eprintln!("[License] is_license_valid: key={}, type={:?}, expires_at={:?}", key, license_type, stored_expires_at);

    // Try to decode the license key
    let data = match decode_license(key) {
        Some(d) => {
            eprintln!("[License] is_license_valid: decoded data exp={}", d.exp);
            d
        },
        None => {
            // Fallback: if decode fails (short format or invalid), use stored expiry time
            eprintln!("[License] is_license_valid: decode failed, using stored expiry");
            return check_local_license_validity(license_type, stored_expires_at);
        }
    };

    // Check if expired (0 means permanent)
    if data.exp > 0 {
        let now = chrono::Utc::now().timestamp();
        if data.exp < now {
            eprintln!("[License] License expired at {}", data.exp);
            return false;
        }
    }

    // Optional: verify against stored expiry to prevent downgrade
    if let Some(stored) = stored_expires_at {
        if let Ok(stored_dt) = chrono::NaiveDateTime::parse_from_str(stored, "%Y-%m-%d %H:%M:%S") {
            let stored_ts = stored_dt.and_utc().timestamp();
            // If stored expiry is LATER than encoded expiry, something is wrong
            if data.exp > 0 && stored_ts > data.exp {
                eprintln!("[License] Stored expiry {} is later than encoded expiry {}, possible tampering", stored_ts, data.exp);
                return false;
            }
        }
    }

    true
}

/// Check if a specific feature is allowed based on license
pub fn is_feature_allowed(feature: LicenseFeature, license_key: Option<&str>, stored_expires_at: Option<&str>, license_type: Option<&str>) -> bool {
    if !feature.requires_license() {
        return true;
    }

    is_license_valid(license_key, stored_expires_at, license_type)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseInfo {
    pub machine_code: String,
    pub license_key: Option<String>,
    pub license_type: Option<String>,
    pub activated_at: Option<String>,
    pub expires_at: Option<String>,
    pub is_valid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseStatus {
    pub valid: bool,
    pub license_type: Option<String>,
    pub expires_at: Option<String>,
    pub error: Option<String>,
}

// Generate machine code from hardware info (internal use, not shown to user)
// Uses: CPU序列号 + 主板序列号 + BIOS_UUID
fn generate_machine_code() -> String {
    let mut hasher = Sha256::new();

    #[cfg(target_os = "macos")]
    {
        // macOS: Try to get hardware UUID from IOKit
        use std::process::Command;

        // Get Platform UUID (same as hardware UUID)
        if let Ok(output) = Command::new("ioreg").args(["-rd1", "-c", "IOPlatformExpertDevice"]).output() {
            let output_str = String::from_utf8_lossy(&output.stdout);
            if let Some(uuid_start) = output_str.find("IOPlatformUUID") {
                let uuid_line = &output_str[uuid_start..];
                if let Some(uuid) = uuid_line.lines().next() {
                    if let Some(eq_pos) = uuid.find('=') {
                        let uuid_value = uuid[eq_pos+1..].trim().trim_matches('"');
                        if !uuid_value.is_empty() {
                            hasher.update(uuid_value.as_bytes());
                        }
                    }
                }
            }
        }

        // Also get CPU architecture info as additional identifier
        if let Ok(output) = Command::new("sysctl").args(["-n", "machdep.cpu.brand"]).output() {
            let cpu_brand = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !cpu_brand.is_empty() {
                hasher.update(cpu_brand.as_bytes());
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        use std::fs;

        // Try to read CPU serial from /proc/cpuinfo
        if let Ok(cpuinfo) = fs::read_to_string("/proc/cpuinfo") {
            for line in cpuinfo.lines() {
                if line.starts_with("Serial") || line.starts_with("processor") {
                    hasher.update(line.as_bytes());
                }
            }
        }

        // Try to read chassis UUID
        if let Ok(uuid) = fs::read_to_string("/sys/class/dmi/id/chassis_uuid") {
            hasher.update(uuid.trim().as_bytes());
        }

        // Try to read board serial
        if let Ok(serial) = fs::read_to_string("/sys/class/dmi/id/board_serial") {
            hasher.update(serial.trim().as_bytes());
        }
    }

    #[cfg(target_windows)]
    {
        use std::process::Command;

        // Use wmic to get BIOS serial and UUID
        if let Ok(output) = Command::new("wmic").args(["csproduct", "get", "UUID"]).output() {
            let uuid = String::from_utf8_lossy(&output.stdout);
            if let Some(last_line) = uuid.lines().last() {
                let uuid = last_line.trim();
                if !uuid.is_empty() && uuid != "UUID" {
                    hasher.update(uuid.as_bytes());
                }
            }
        }

        // Get CPU ID
        if let Ok(output) = Command::new("wmic").args(["cpu", "get", "ProcessorId"]).output() {
            let cpu_id = String::from_utf8_lossy(&output.stdout);
            if let Some(last_line) = cpu_id.lines().last() {
                let cpu_id = last_line.trim();
                if !cpu_id.is_empty() && cpu_id != "ProcessorId" {
                    hasher.update(cpu_id.as_bytes());
                }
            }
        }
    }

    // Fallback: use system name and hostname
    use sysinfo::System;
    let sys = System::new();
    hasher.update(System::name().unwrap_or_default().as_bytes());
    hasher.update(System::host_name().unwrap_or_default().as_bytes());

    let result = hasher.finalize();
    format!("{:X}", result)
}

// Get or create license info from database
pub fn get_license_info(db: &Mutex<Connection>) -> Result<LicenseInfo, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let get_config = |key: &str| -> Option<String> {
        conn.query_row(
            "SELECT value FROM family_config WHERE key = ?",
            [key],
            |row| row.get(0)
        ).ok()
    };

    let machine_code = get_config(CONFIG_LICENSE_MACHINE_CODE)
        .unwrap_or_else(|| {
            let new_code = generate_machine_code();
            let _ = conn.execute(
                "INSERT INTO family_config (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [CONFIG_LICENSE_MACHINE_CODE, &new_code]
            );
            new_code
        });

    let license_key = get_config(CONFIG_LICENSE_KEY);
    let license_type = get_config(CONFIG_LICENSE_TYPE);
    let activated_at = get_config(CONFIG_LICENSE_ACTIVATED_AT);
    let expires_at = get_config(CONFIG_LICENSE_EXPIRES_AT);

    println!("[License] get_license_info: key={:?}, type={:?}, activated={:?}, expires={:?}",
        license_key, license_type, activated_at, expires_at);

    // Check if license is valid using encoded key (with anti-tampering)
    let is_valid = is_license_valid(license_key.as_deref(), expires_at.as_deref(), license_type.as_deref());

    Ok(LicenseInfo {
        machine_code,
        license_key,
        license_type,
        activated_at,
        expires_at,
        is_valid,
    })
}

fn check_local_license_validity(
    license_type: Option<&str>,
    expires_at: Option<&str>,
) -> bool {
    let Some(lt) = license_type else {
        eprintln!("[License] check_local_license_validity: no license_type");
        return false;
    };

    // If has license type but no expiry, it's permanent
    if expires_at.is_none() {
        eprintln!("[License] check_local_license_validity: {} has no expiry, valid", lt);
        return true;
    }

    // Check expiration - use local time to match how expires_at is stored
    if let Some(exp) = expires_at {
        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(exp, "%Y-%m-%d %H:%M:%S") {
            let now = chrono::Local::now().naive_local();
            let is_valid = now < dt;
            eprintln!("[License] check_local_license_validity: {} expires_at={}, now={}, is_valid={}",
                     lt, dt, now, is_valid);
            return is_valid;
        } else {
            eprintln!("[License] check_local_license_validity: failed to parse expires_at: {}", exp);
        }
    }

    eprintln!("[License] check_local_license_validity: default returning false");
    false
}

// Activate license with key (user only provides license key)
pub async fn activate_license(
    db: Arc<Mutex<Connection>>,
    license_key: &str,
) -> Result<LicenseStatus, String> {
    // Get machine code from config
    let machine_code = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT value FROM family_config WHERE key = ?",
            [CONFIG_LICENSE_MACHINE_CODE],
            |row| row.get::<_, String>(0)
        ).unwrap_or_else(|_| generate_machine_code())
    };

    let client = Client::new();

    #[derive(Serialize)]
    struct ActivateRequest {
        license_key: String,
    }

    let response = client
        .post(&format!("{}/api/license/activate", LICENSE_SERVER_URL))
        .query(&[("machine_code", &machine_code)])
        .json(&ActivateRequest {
            license_key: license_key.to_string(),
        })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    // 不再返回具体的错误详情，防止泄露服务器信息
    if !response.status().is_success() {
        return Err("授权码无效".to_string());
    }

    #[derive(Deserialize)]
    struct ActivateData {
        license_type: String,
        activated_at: String,
        expires_at: Option<String>,
    }

    #[derive(Deserialize)]
    struct ActivateResponse {
        success: bool,
        data: Option<ActivateData>,
    }

    let result: ActivateResponse = response.json().await.map_err(|e| e.to_string())?;

    if let Some(data) = result.data {
        let conn = db.lock().map_err(|e| e.to_string())?;

        // Store license info
        let updates = [
            (CONFIG_LICENSE_KEY, license_key),
            (CONFIG_LICENSE_TYPE, &data.license_type),
            (CONFIG_LICENSE_ACTIVATED_AT, &data.activated_at),
        ];

        for (key, value) in updates {
            if let Err(e) = conn.execute(
                "INSERT INTO family_config (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [key, value]
            ) {
                eprintln!("Failed to save {}: {}", key, e);
            } else {
                println!("[License] Saved {} = {}", key, value);
            }
        }

        let expires_at_str = if let Some(ref expires) = data.expires_at {
            if let Err(e) = conn.execute(
                "INSERT INTO family_config (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [CONFIG_LICENSE_EXPIRES_AT, expires]
            ) {
                eprintln!("Failed to save expires_at: {}", e);
            } else {
                println!("[License] Saved expires_at = {}", expires);
            }
            Some(expires.clone())
        } else {
            None
        };

        return Ok(LicenseStatus {
            valid: true,
            license_type: Some(data.license_type),
            expires_at: expires_at_str,
            error: None,
        });
    }

    Err("激活失败".to_string())
}

// Verify license with server
pub async fn verify_license(
    db: Arc<Mutex<Connection>>,
    license_key: &str,
) -> Result<LicenseStatus, String> {
    // Get machine code from config
    let machine_code = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT value FROM family_config WHERE key = ?",
            [CONFIG_LICENSE_MACHINE_CODE],
            |row| row.get::<_, String>(0)
        ).unwrap_or_else(|_| generate_machine_code())
    };

    let client = Client::new();

    #[derive(Serialize)]
    struct VerifyRequest {
        license_key: String,
    }

    let response = client
        .post(&format!("{}/api/license/verify", LICENSE_SERVER_URL))
        .query(&[("machine_code", &machine_code)])
        .json(&VerifyRequest {
            license_key: license_key.to_string(),
        })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err("验证失败，请检查网络连接".to_string());
    }

    #[derive(Deserialize)]
    struct VerifyResponse {
        success: bool,
        data: Option<VerifyData>,
    }

    #[derive(Deserialize)]
    struct VerifyData {
        valid: bool,
        license_type: Option<String>,
        expires_at: Option<String>,
    }

    let result: VerifyResponse = response.json().await.map_err(|e| e.to_string())?;

    if let Some(data) = result.data {
        // Update last verified time
        if let Ok(conn) = db.lock() {
            let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let _ = conn.execute(
                "INSERT INTO family_config (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [CONFIG_LICENSE_VERIFIED_AT, &now]
            );
        }

        return Ok(LicenseStatus {
            valid: data.valid,
            license_type: data.license_type,
            expires_at: data.expires_at,
            error: None,
        });
    }

    Err("验证失败".to_string())
}