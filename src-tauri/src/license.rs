use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use sysinfo::System;
use tracing::{info, warn, debug, trace};

/// RSA Public Key for license verification (2048-bit)
/// This is the public key corresponding to the server's private key
use crate::constants::LICENSE_PUBLIC_KEY_PEM;
use crate::utils::machine_code::generate_machine_code;
// NTP server for time synchronization (国内可用的 NTP 服务器)
const NTP_SERVERS: &[&str] = &[
    "ntp.aliyun.com:123",
    "ntp.tencent.com:123",
    "time.windows.com:123",
];

// License configuration keys
pub const CONFIG_LICENSE_MACHINE_CODE: &str = "license_machine_code";
pub const CONFIG_LICENSE_KEY: &str = "license_key";  // Short format for display
pub const CONFIG_LICENSE_AUTH_CODE: &str = "license_auth_code";  // JWT auth code for local verification
pub const CONFIG_LICENSE_TYPE: &str = "license_type";
pub const CONFIG_LICENSE_ACTIVATED_AT: &str = "license_activated_at";
pub const CONFIG_LICENSE_VERIFIED_AT: &str = "license_verified_at";

// Trial license constants
#[allow(dead_code)]
const TRIAL_DAYS: i64 = 30;

// 授权服务器地址（代码层面配置）
use crate::constants::LICENSE_SERVER_URL;

/// License data decoded from auth code
#[derive(Debug, Clone)]
pub struct LicenseData {
    pub exp: i64,       // Unix timestamp, 0 means permanent
    pub jti: String,    // Unique identifier
    pub start_at: String, // Activation time
}

/// Features that require license authorization
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LicenseFeature {
    ExportHtml,
    ExportWord,
    ExportVolume,
    ExportScreenshot,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct FeatureInfo {
    pub name: String,
    pub display_name: String,
    pub description: String,
}

impl LicenseFeature {
    pub fn requires_license(&self) -> bool {
        match self {
            LicenseFeature::ExportHtml => true,
            LicenseFeature::ExportWord => true,
            LicenseFeature::ExportVolume => true,
            LicenseFeature::ExportScreenshot => true,
        }
    }

    /// Get all features that require license
    pub fn all_features() -> Vec<FeatureInfo> {
        vec![
            FeatureInfo {
                name: "export_html".to_string(),
                display_name: "HTML导出".to_string(),
                description: "导出族谱为HTML格式".to_string(),
            },
            FeatureInfo {
                name: "export_word".to_string(),
                display_name: "Word导出".to_string(),
                description: "导出族谱为Word格式".to_string(),
            },
            FeatureInfo {
                name: "export_volume".to_string(),
                display_name: "分册导出".to_string(),
                description: "分册导出族谱".to_string(),
            },
            FeatureInfo {
                name: "export_screenshot".to_string(),
                display_name: "截图下载".to_string(),
                description: "族谱树截图下载".to_string(),
            },
        ]
    }

    /// Get feature by name
    pub fn from_name(name: &str) -> Option<LicenseFeature> {
        match name {
            "export_html" => Some(LicenseFeature::ExportHtml),
            "export_word" => Some(LicenseFeature::ExportWord),
            "export_volume" => Some(LicenseFeature::ExportVolume),
            "export_screenshot" => Some(LicenseFeature::ExportScreenshot),
            _ => None,
        }
    }
}

/// Get current time from NTP server (returns Unix timestamp)
/// Returns None if NTP fails - caller should treat None as authorization invalid
pub fn get_ntp_time() -> Option<i64> {
    // Simple cache: store result for 30 seconds to avoid duplicate NTP calls
    use std::sync::OnceLock;
    static CACHE: OnceLock<(i64, std::time::Instant)> = OnceLock::new();

    // Check if cached result is still valid (within 30 seconds)
    if let Some((cached_time, cached_at)) = CACHE.get() {
        if cached_at.elapsed().as_secs() < 30 {
            return Some(*cached_time);
        }
    }

    for server in NTP_SERVERS {
        trace!("Trying NTP server: {}", server);
        match ntp::request(*server) {
            Ok(packet) => {
                // Get transmit timestamp from packet and convert to Unix timestamp
                // NTP epoch is 1900-01-01, Unix epoch is 1970-01-01
                // Offset is 2208988800 seconds
                const NTP_UNIX_OFFSET: u64 = 2208988800;

                // Use .sec field to get seconds since NTP epoch
                let ntp_secs: u64 = packet.transmit_time.sec as u64;
                let unix_time = (ntp_secs as i64) - (NTP_UNIX_OFFSET as i64);

                if unix_time > 1000000000 && unix_time < 10000000000 {
                    // Sanity check: Unix timestamp should be between 2001 and 2286
                    info!("NTP time synced: {} (server: {})", unix_time, server);
                    // Store in cache (ignore result - if already set by another call, that's fine)
                    let _ = CACHE.set((unix_time, std::time::Instant::now()));
                    return Some(unix_time);
                } else {
                    warn!("NTP timestamp out of range: {}", unix_time);
                }
            }
            Err(e) => {
                warn!("NTP sync failed for {}: {:?}", server, e);
            }
        }
    }

    // NTP 全部失败，返回 None
    warn!("NTP sync failed, returning None");
    None
}

/// Check if license is expired using NTP time
/// Returns true if expired or if NTP time is unavailable
pub fn is_expired_by_ntp(expires_at: &str) -> bool {
    let exp_timestamp = match chrono::NaiveDateTime::parse_from_str(expires_at, "%Y-%m-%d %H:%M:%S") {
        Ok(dt) => dt.and_utc().timestamp(),
        Err(e) => {
            warn!("Failed to parse expires_at '{}': {}", expires_at, e);
            return false; // 解析失败时不认为过期
        }
    };

    // If NTP time is unavailable, treat as expired
    let Some(current_time) = get_ntp_time() else {
        info!("NTP time unavailable, treating as expired");
        return true;
    };

    current_time >= exp_timestamp
}

/// Get remaining days using NTP time (returns 0 if expired or NTP unavailable)
/// 注意：expires_at 是本地时间字符串，需要转成 UTC 时间戳来比较
pub fn get_remaining_days_by_ntp(expires_at: &str) -> i64 {
    // expires_at 是本地时间字符串，格式为 "%Y-%m-%d %H:%M:%S"
    // 需要转成 UTC Unix 时间戳来与 NTP 时间比较
    let exp_timestamp = match chrono::NaiveDateTime::parse_from_str(expires_at, "%Y-%m-%d %H:%M:%S") {
        Ok(dt) => {
            // 先转成本地 DateTime，再转成 UTC 时间戳
            let local_dt = dt.and_local_timezone(chrono::Local).unwrap();
            let utc_dt = local_dt.with_timezone(&chrono::Utc);
            utc_dt.timestamp()
        },
        Err(e) => {
            warn!("Failed to parse expires_at '{}': {}", expires_at, e);
            return 0;
        }
    };

    // If NTP time is unavailable, return 0 (can't calculate remaining days)
    let Some(current_time) = get_ntp_time() else {
        info!("NTP time unavailable, returning 0 days");
        return 0;
    };

    let diff = exp_timestamp - current_time;
    diff / 86400 // Convert seconds to days
}



/// Decode auth code and verify RSA signature (JWT format RS256)
/// Format: GLY-{base64url(header)}.{base64url(payload)}.{base64url(signature)}
///
/// JWT Payload contains: {"exp": timestamp, "jti": uuid, "start_at": datetime}
fn decode_auth_code(encoded: &str) -> Option<LicenseData> {
    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD as BASE64URL};

    debug!(module="license", "decode_auth_code: input length = {}", encoded.len());

    // Split only on the first '-' to separate prefix from JWT
    // Format: PREFIX-JWT (where JWT = header.payload.signature)
    let Some((_prefix, jwt_part)) = encoded.split_once('-') else {
        warn!(module="license", "decode_auth_code: invalid format (no prefix)");
        return None;
    };
    debug!(module="license", "decode_auth_code: jwt_part = {}...", &jwt_part[..jwt_part.len().min(50)]);

    // Split JWT into header.payload.signature
    let jwt_parts: Vec<&str> = jwt_part.split('.').collect();
    debug!(module="license", "decode_auth_code: jwt has {} parts", jwt_parts.len());

    if jwt_parts.len() != 3 {
        warn!(module="license", "decode_auth_code: JWT should have 3 parts, got {}", jwt_parts.len());
        return None;
    }

    let (_header_b64, payload_b64, signature_b64) = (jwt_parts[0], jwt_parts[1], jwt_parts[2]);

    // Decode signature
    let signature = match BASE64URL.decode(signature_b64) {
        Ok(s) => s,
        Err(e) => {
            warn!(module="license", "decode_auth_code: failed to decode signature: {}", e);
            return None;
        }
    };

    // Verify signature
    let signing_input = format!("{}.{}", _header_b64, payload_b64);
    use rsa::signature::Verifier;
    use rsa::pkcs1v15::Signature;
    use rsa::{RsaPublicKey, pkcs8::DecodePublicKey};

    // Parse public key from PEM
    let public_key = RsaPublicKey::from_public_key_pem(LICENSE_PUBLIC_KEY_PEM)
        .map_err(|e| e.to_string()).unwrap();

    // Use new() which includes the correct prefix for RS256
    // RS256 = RSA with SHA256 (requires DER-encoded OID prefix)
    // Note: requires sha2 with oid feature
    let verifying_key: rsa::pkcs1v15::VerifyingKey<sha2::Sha256> =
        rsa::pkcs1v15::VerifyingKey::new(public_key);

    let signature = Signature::try_from(signature.as_slice()).unwrap();
    let verify_result = verifying_key.verify(signing_input.as_bytes(), &signature);

    if verify_result.is_err() {
        warn!(module="license", "decode_auth_code: signature verification failed");
        return None;
    }

    // Decode payload
    let payload_bytes = match BASE64URL.decode(payload_b64) {
        Ok(p) => p,
        Err(e) => {
            warn!(module="license", "decode_auth_code: failed to decode payload: {}", e);
            return None;
        }
    };

    let payload_str = String::from_utf8(payload_bytes).map_err(|e| e.to_string()).ok()?;
    debug!(module="license", "decode_auth_code: payload_str = {}", payload_str);

    let json: serde_json::Value = match serde_json::from_str(&payload_str) {
        Ok(j) => j,
        Err(e) => {
            warn!(module="license", "decode_auth_code: failed to parse payload JSON: {}", e);
            return None;
        }
    };

    let exp = json.get("exp").and_then(|v| v.as_i64()).unwrap_or(0);
    let jti = json.get("jti").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let start_at = json.get("start_at").and_then(|v| v.as_str()).unwrap_or("").to_string();

    debug!(module="license", "decode_auth_code: exp={}, start_at={}", exp, start_at);

    Some(LicenseData {
        exp,
        jti,
        start_at,
    })
}

/// Request trial license from server
/// Returns (license_key, auth_code, expires_at)
pub async fn request_trial_license_from_server(machine_code: &str) -> Result<(String, String, String), String> {
    let client = Client::new();

    #[derive(Deserialize)]
    struct TrialResponse {
        success: bool,
        data: Option<TrialData>,
        error: Option<String>,
    }

    #[derive(Deserialize)]
    struct TrialData {
        #[allow(dead_code)]
        license_key: String,
        #[allow(dead_code)]
        auth_code: String,
        #[allow(dead_code)]
        license_type: String,
        #[allow(dead_code)]
        expires_at: Option<String>,
        #[allow(dead_code)]
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
            info!(module="license", "Trial license: {} (is_existing: {})", data.license_key, data.is_existing);
            return Ok((
                data.license_key,
                data.auth_code,
                data.expires_at.unwrap_or_else(|| "2099-12-31 23:59:59".to_string())
            ));
        }
    }

    Err(result.error.unwrap_or_else(|| "获取试用授权失败".to_string()))
}

/// Get or create trial license from server
/// This function is async because it needs to call the license server
/// Trial licenses are auto-activated (no manual activation needed)
pub async fn get_or_generate_trial_license_async(db: Arc<Mutex<Connection>>) -> Result<(String, String, String), String> {
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

    // Request trial from server - returns (license_key, auth_code, expires_at)
    let (trial_key, auth_code, expires_at) = request_trial_license_from_server(&machine_code).await?;

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
            [CONFIG_LICENSE_AUTH_CODE, &auth_code]
        );
        let _ = conn.execute(
            "INSERT INTO family_config (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [CONFIG_LICENSE_TYPE, "trial"]
        );
        let _ = conn.execute(
            "INSERT INTO family_config (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [CONFIG_LICENSE_ACTIVATED_AT, &now]
        );
    }

    info!(module="license", "Trial auto-activated: {} (expires: {})", trial_key, expires_at);

    Ok((trial_key, auth_code, expires_at))
}

/// Check if a license is valid (not expired)
/// The auth_code is the RSA encrypted code for local verification
/// Default returns false - only returns true when we can verify the license is valid
pub fn is_license_valid(auth_code: Option<&str>, stored_expires_at: Option<&str>, license_type: Option<&str>) -> bool {
    let Some(code) = auth_code else {
        debug!(module="license", "is_license_valid: no auth_code, returning false");
        return false;
    };

    debug!(module="license", "is_license_valid: checking license validity");

    // Decode the auth code to get expiration time
    let data = match decode_auth_code(code) {
        Some(d) => d,
        None => {
            // Decode failed - license is invalid
            debug!(module="license", "is_license_valid: decode failed, returning false");
            return false;
        }
    };

    // Check if expired (0 means permanent license - never expires)
    if data.exp > 0 {
        // If NTP time is unavailable, license is invalid
        let Some(now) = get_ntp_time() else {
            info!(module="license", "is_license_valid: NTP time unavailable, returning false");
            return false;
        };

        if data.exp < now {
            info!(module="license", "is_license_valid: license expired at {}, NTP now: {}, returning false", data.exp, now);
            return false;
        }
        info!(module="license", "is_license_valid: license valid (exp={}, now={})", data.exp, now);
        return true;
    }

    // exp == 0 means permanent license
    debug!(module="license", "is_license_valid: permanent license, returning true");
    true
}

/// Check if a specific feature is allowed based on license
pub fn is_feature_allowed(feature: LicenseFeature, auth_code: Option<&str>, stored_expires_at: Option<&str>, license_type: Option<&str>) -> bool {
    if !feature.requires_license() {
        return true;
    }

    is_license_valid(auth_code, stored_expires_at, license_type)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseInfo {
    pub machine_code: String,
    pub license_key: Option<String>,  // Short format for display
    pub auth_code: Option<String>,  // RSA encrypted for local verification
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
    pub activated_at: Option<String>,
    pub error: Option<String>,
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
    let auth_code = get_config(CONFIG_LICENSE_AUTH_CODE);
    let license_type = get_config(CONFIG_LICENSE_TYPE);
    let activated_at = get_config(CONFIG_LICENSE_ACTIVATED_AT);

    // Decode auth_code to get expires_at
    let (expires_at, _start_at) = if let Some(ref code) = auth_code {
        if let Some(data) = decode_auth_code(code) {
            if data.exp > 0 {
                // Convert timestamp to datetime string (interpret as UTC, convert to local)
                let dt = chrono::DateTime::from_timestamp(data.exp, 0)
                    .map(|dt| dt.with_timezone(&chrono::Local).format("%Y-%m-%d %H:%M:%S").to_string())
                    .unwrap_or_default();
                (Some(dt), Some(data.start_at))
            } else {
                // Permanent license
                (None, Some(data.start_at))
            }
        } else {
            (None, activated_at.clone())
        }
    } else {
        (None, None)
    };

    info!(module="license", "get_license_info: key={:?}, auth_code={:?}, type={:?}, activated={:?}, expires={:?}",
        license_key, auth_code, license_type, activated_at, expires_at);

    // Check if license is valid using auth code (with anti-tampering)
    let is_valid = is_license_valid(auth_code.as_deref(), expires_at.as_deref(), license_type.as_deref());

    Ok(LicenseInfo {
        machine_code,
        license_key,
        auth_code,
        license_type,
        activated_at,
        expires_at,
        is_valid,
    })
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
        #[allow(dead_code)]
        license_key: String,  // Short format for display
        #[allow(dead_code)]
        auth_code: String,  // RSA encrypted for local verification
        #[allow(dead_code)]
        license_type: String,
        #[allow(dead_code)]
        activated_at: String,
        #[allow(dead_code)]
        expires_at: Option<String>,
    }

    #[derive(Deserialize)]
    struct ActivateResponse {
        #[allow(dead_code)]
        success: bool,
        data: Option<ActivateData>,
    }

    let result: ActivateResponse = response.json().await.map_err(|e| e.to_string())?;

    if let Some(data) = result.data {
        let conn = db.lock().map_err(|e| e.to_string())?;

        // Store license info
        let updates = [
            (CONFIG_LICENSE_KEY, data.license_key.as_str()),
            (CONFIG_LICENSE_AUTH_CODE, data.auth_code.as_str()),
            (CONFIG_LICENSE_TYPE, &data.license_type),
            (CONFIG_LICENSE_ACTIVATED_AT, &data.activated_at),
        ];

        for (key, value) in updates {
            match conn.execute(
                "INSERT INTO family_config (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [key, value]
            ) { Err(e) => {
                warn!(module="license", "Failed to save {}: {}", key, e);
            } _ => {
                debug!(module="license", "Saved {} = {}", key, value);
            }}
        }

        // Decode auth_code to get expires_at
        let expires_at = if let Some(license_data) = decode_auth_code(&data.auth_code) {
            if license_data.exp > 0 {
                chrono::DateTime::from_timestamp(license_data.exp, 0)
                    .map(|dt| dt.with_timezone(&chrono::Local).format("%Y-%m-%d %H:%M:%S").to_string())
            } else {
                None // Permanent
            }
        } else {
            None
        };

        return Ok(LicenseStatus {
            valid: true,
            license_type: Some(data.license_type),
            expires_at,
            activated_at: Some(data.activated_at),
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

    #[derive(Deserialize, Debug)]
    struct VerifyResponse {
        // #[allow(dead_code)]
        success: bool,
        error: Option<String>,
        data: Option<VerifyData>,
    }

    #[derive(Deserialize, Debug)]
    struct VerifyData {
        #[allow(dead_code)]
        valid: bool,
        #[allow(dead_code)]
        license_type: Option<String>,
        #[allow(dead_code)]
        expires_at: Option<String>,
        #[allow(dead_code)]
        auth_code: Option<String>,
    }

    let result: VerifyResponse = response.json().await.map_err(|e| e.to_string())?;
    // info!("result: {:?}", result);

    // Check if success is false, return error message if present
    if !result.success {
        let error_msg = result.error.unwrap_or_else(|| "验证失败".to_string());

        // 如果是解绑相关的错误，清除本地授权记录
        if error_msg.contains("解绑") || error_msg.contains("已失效") || error_msg.contains("已被注销") {
            if let Ok(conn) = db.lock() {
                let keys = [
                    CONFIG_LICENSE_KEY,
                    CONFIG_LICENSE_AUTH_CODE,
                    CONFIG_LICENSE_TYPE,
                    CONFIG_LICENSE_ACTIVATED_AT,
                    CONFIG_LICENSE_VERIFIED_AT,
                ];
                for key in keys {
                    let _ = conn.execute("DELETE FROM family_config WHERE key = ?1", [key]);
                }
                tracing::warn!("License unbound, local records cleared");
            }
        }

        return Err(error_msg);
    }

    if let Some(data) = result.data {
        // Update last verified time
        if let Ok(conn) = db.lock() {
            let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let _ = conn.execute(
                "INSERT INTO family_config (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [CONFIG_LICENSE_VERIFIED_AT, &now]
            );

            // Update auth_code if returned
            if let Some(ref auth_code) = data.auth_code {
                let _ = conn.execute(
                    "INSERT INTO family_config (key, value) VALUES (?1, ?2)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    [CONFIG_LICENSE_AUTH_CODE, auth_code]
                );
            }
        }

        return Ok(LicenseStatus {
            valid: data.valid,
            license_type: data.license_type,
            expires_at: data.expires_at,
            activated_at: None,
            error: None,
        });
    }

    Err("验证失败".to_string())
}
