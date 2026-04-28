use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use sha2::{Sha256, Digest};
use sysinfo::System;

// License configuration keys
pub const CONFIG_LICENSE_MACHINE_CODE: &str = "license_machine_code";
pub const CONFIG_LICENSE_KEY: &str = "license_key";
pub const CONFIG_LICENSE_TYPE: &str = "license_type";
pub const CONFIG_LICENSE_ACTIVATED_AT: &str = "license_activated_at";
pub const CONFIG_LICENSE_EXPIRES_AT: &str = "license_expires_at";
pub const CONFIG_LICENSE_VERIFIED_AT: &str = "license_verified_at";

// 授权服务器地址（代码层面配置）
use crate::constants::LICENSE_SERVER_URL;

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
fn generate_machine_code() -> String {
    let mut sys = System::new_all();
    sys.refresh_all();

    let mut hasher = Sha256::new();

    // CPU brand
    for cpu in sys.cpus() {
        hasher.update(cpu.brand().as_bytes());
    }

    // System name
    hasher.update(System::name().unwrap_or_default().as_bytes());
    // Hostname
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

    // Check if license is valid locally
    let is_valid = check_local_license_validity(license_type.as_deref(), expires_at.as_deref());

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
    let Some(_lt) = license_type else {
        return false;
    };

    // If has license type but no expiry, it's permanent
    if expires_at.is_none() {
        return true;
    }

    // Check expiration
    if let Some(exp) = expires_at {
        if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(exp, "%Y-%m-%d %H:%M:%S") {
            return chrono::Utc::now().naive_utc() < dt;
        }
    }

    true
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