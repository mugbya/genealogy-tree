use std::sync::{Arc, Mutex};
use std::time::Duration;
use rusqlite::Connection;
use serde_json::json;
use chrono::{Local, Timelike};
use sysinfo::System;

use crate::models::usage_report::{UsageReport, PendingReport};

/// 上报地址 - 编译时确定，开发时可修改此值
const USAGE_REPORT_URL: &str = "http://162.14.99.144/api/usage/report";

/// Get all pending reports from database
fn get_pending_reports(db: &Mutex<Connection>) -> Result<Vec<PendingReport>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, report_data, report_date, created_at FROM pending_reports ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;

    let reports = stmt.query_map([], |row| {
        Ok(PendingReport {
            id: row.get(0)?,
            report_data: row.get(1)?,
            report_date: row.get(2)?,
            created_at: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(reports)
}

/// Clear all pending reports from database
fn clear_pending_reports(db: &Mutex<Connection>) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM pending_reports", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Save failed report to pending_reports table
fn save_pending_report(db: &Mutex<Connection>, report: &UsageReport) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let report_json = serde_json::to_string(report).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp();

    conn.execute(
        "INSERT INTO pending_reports (report_data, report_date, created_at) VALUES (?, ?, ?)",
        rusqlite::params![report_json, report.report_date.clone(), now],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

/// Get public IP address
fn get_public_ip() -> String {
    let services = [
        "https://api.ipify.org",
        "https://checkip.amazonaws.com",
        "https://icanhazip.com",
    ];

    for service in &services {
        if let Ok(response) = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .and_then(|client| client.get(*service).send())
        {
            if let Ok(ip) = response.text() {
                let ip = ip.trim().to_string();
                if !ip.is_empty() && ip.parse::<std::net::IpAddr>().is_ok() {
                    return ip;
                }
            }
        }
    }

    "unknown".to_string()
}

/// Get IP location/geo info, returns (country, region, city)
fn get_ip_geo_info(ip: &str) -> (String, String, String) {
    if ip == "unknown" {
        return ("unknown".to_string(), "unknown".to_string(), "unknown".to_string());
    }

    let url = format!("http://ip-api.com/json/{}?fields=status,country,regionName,city", ip);

    if let Ok(response) = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .and_then(|client| client.get(&url).header("Accept", "application/json").send())
    {
        if let Ok(json_response) = response.json::<serde_json::Value>() {
            if json_response.get("status").and_then(|s| s.as_str()) == Some("success") {
                let country = json_response.get("country").and_then(|c| c.as_str()).unwrap_or("").to_string();
                let region = json_response.get("regionName").and_then(|r| r.as_str()).unwrap_or("").to_string();
                let city = json_response.get("city").and_then(|c| c.as_str()).unwrap_or("").to_string();

                return (country, region, city);
            }
        }
    }

    ("unknown".to_string(), "unknown".to_string(), "unknown".to_string())
}

/// Collect system usage information
fn collect_usage_info() -> UsageReport {
    let app_version = env!("CARGO_PKG_VERSION").to_string();

    let os_name = System::name().unwrap_or_else(|| "Unknown".to_string());
    let os_version = System::os_version().unwrap_or_else(|| "Unknown".to_string());

    let public_ip = get_public_ip();
    let (country, region, city) = get_ip_geo_info(&public_ip);

    let report_date = Local::now().format("%Y-%m-%d").to_string();

    UsageReport {
        app_version,
        os_name,
        os_version,
        public_ip,
        country,
        region,
        city,
        report_date,
    }
}

/// Send report to remote server
async fn send_report_to_server(reports: Vec<UsageReport>, url: &str) -> Result<(), String> {
    let client = reqwest::Client::new();

    let body = json!({ "reports": reports });

    let response = client
        .post(url)
        .json(&body)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        Err(format!("Server returned error: {} - {}", status, text))
    }
}

/// Check and execute report task
pub fn check_and_report(db: Arc<Mutex<Connection>>) {
    eprintln!("[usage_report] Starting usage report check...");
    eprintln!("[usage_report] Report URL: {}", USAGE_REPORT_URL);

    let current_report = collect_usage_info();
    eprintln!("[usage_report] Collected info - IP: {}, Country: {}, Region: {}, City: {}", current_report.public_ip, current_report.country, current_report.region, current_report.city);

    let pending = match get_pending_reports(&db) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[usage_report] Failed to get pending reports: {}", e);
            return;
        }
    };

    let mut all_reports: Vec<UsageReport> = Vec::new();
    all_reports.push(current_report.clone());

    for pending_item in &pending {
        if let Ok(report) = serde_json::from_str::<UsageReport>(&pending_item.report_data) {
            all_reports.push(report);
        }
    }

    eprintln!("[usage_report] Total reports to send: {} (1 current + {} pending)", all_reports.len(), pending.len());

    let rt = tokio::runtime::Runtime::new().expect("Failed to create runtime");
    let result = rt.block_on(async {
        send_report_to_server(all_reports, USAGE_REPORT_URL).await
    });

    match result {
        Ok(()) => {
            eprintln!("[usage_report] Report sent successfully, clearing pending reports...");
            if let Err(e) = clear_pending_reports(&db) {
                eprintln!("[usage_report] Failed to clear pending reports: {}", e);
            }
        }
        Err(e) => {
            eprintln!("[usage_report] Failed to send report: {}, saving to pending...", e);
            if let Err(e) = save_pending_report(&db, &current_report) {
                eprintln!("[usage_report] Failed to save pending report: {}", e);
            }
        }
    }
}

/// Start the usage report timer
pub fn start_report_timer(db: Arc<Mutex<Connection>>) {
    std::thread::spawn(move || {
        check_and_report(db.clone());

        loop {
            let now = Local::now();
            let next_noon = if now.hour() < 12 {
                now.date_naive()
                    .and_hms_opt(12, 0, 0)
                    .unwrap()
            } else {
                (now.date_naive() + chrono::Duration::days(1))
                    .and_hms_opt(12, 0, 0)
                    .unwrap()
            };

            let duration_until_noon = (next_noon - now.naive_local()).num_seconds() as u64;
            eprintln!("[usage_report] Next report scheduled in {} seconds (at 12:00)", duration_until_noon);

            std::thread::sleep(std::time::Duration::from_secs(duration_until_noon));

            check_and_report(db.clone());

            eprintln!("[usage_report] Next report in 24 hours...");
            std::thread::sleep(std::time::Duration::from_secs(24 * 60 * 60));
        }
    });
}