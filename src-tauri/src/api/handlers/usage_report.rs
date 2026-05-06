use std::sync::{Arc, Mutex};
use std::time::Duration;
use rusqlite::Connection;
use serde_json::json;
use chrono::{Local, Timelike};
use sysinfo::System;
use tracing::{info, warn, debug};

use crate::models::usage_report::{UsageReport, PendingReport};

/// 上报地址 - 编译时确定，与授权服务器地址一致
use crate::constants::USAGE_REPORT_URL;
use crate::utils::machine_code::generate_machine_code;

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

/// IP and geo info result
struct IpGeoResult {
    ip: String,
    country: String,
    region: String,
    city: String,
}

/// Get public IP address and geo info (combined to avoid duplicate requests)
fn get_public_ip_with_geo() -> IpGeoResult {
    let services = [
        // 国内服务 - 直接返回 IP 和地理位置
        ("https://myip.ipip.net", true),   // 返回格式: "IP  来自于：中国 四川 成都  电信"
        ("https://ip.cn", true),            // 返回格式: "IP  来自于：中国 广东 佛山  电信"
        ("https://ip.sb", false),          // 只返回 IP
        // 国外服务 - 只返回 IP
        ("https://checkip.amazonaws.com", false),
    ];

    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            debug!(module="usage_report", "Failed to create HTTP client: {}", e);
            return IpGeoResult { ip: "unknown".to_string(), country: "unknown".to_string(), region: "unknown".to_string(), city: "unknown".to_string() };
        }
    };

    for (service, has_geo) in &services {
        debug!(module="usage_report", "Trying to get IP from: {}", service);

        let response = client
            .get(*service)
            .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .send();

        match response {
            Ok(resp) => {
                let status = resp.status();
                debug!(module="usage_report", "Service {} returned status: {}", service, status);

                match resp.text() {
                    Ok(text) => {
                        let text = text.trim().to_string();

                        // 遍历所有单词，找到第一个有效的 IP 地址
                        for word in text.split_whitespace() {
                            // 先去除可能的前缀（如 "IP："、"当前 IP：" 等）
                            let clean_word = word
                                .trim_start_matches("当前 IP：")
                                .trim_start_matches("当前 IP:")
                                .trim_start_matches("IP：")
                                .trim_start_matches("IP:");

                            if clean_word.parse::<std::net::IpAddr>().is_ok() {
                                debug!(module="usage_report", "Service {} returned valid IP: {}", service, clean_word);

                                // 如果服务提供地理位置信息，解析它
                                if *has_geo {
                                    // 格式: "当前 IP：171.216.136.142  来自于：中国 四川 成都  电信"
                                    // 找 "来自于：" 之后的内容（支持全角冒号和半角冒号）
                                    let geo_markers = ["来自于：", "来自于:"];
                                    for marker in &geo_markers {
                                        if let Some(pos) = text.find(*marker) {
                                            let geo_part = &text[pos + marker.len()..];
                                            let parts: Vec<&str> = geo_part.split_whitespace().collect();
                                            if parts.len() >= 3 {
                                                let country = parts[0].to_string();
                                                let region = parts[1].to_string();
                                                let city = parts[2].to_string();
                                                debug!(module="usage_report", "Parsed geo from {}: country={}, region={}, city={}", service, country, region, city);
                                                return IpGeoResult {
                                                    ip: clean_word.to_string(),
                                                    country,
                                                    region,
                                                    city,
                                                };
                                            }
                                        }
                                    }
                                }

                                // 只返回 IP，地理位置需要后续查询
                                return IpGeoResult {
                                    ip: clean_word.to_string(),
                                    country: "unknown".to_string(),
                                    region: "unknown".to_string(),
                                    city: "unknown".to_string(),
                                };
                            }
                        }
                        debug!(module="usage_report", "Service {} returned no valid IP", service);
                    }
                    Err(e) => {
                        debug!(module="usage_report", "Service {} failed to read response: {}", service, e);
                    }
                }
            }
            Err(e) => {
                debug!(module="usage_report", "Service {} request failed: {}", service, e);
            }
        }
    }

    debug!(module="usage_report", "All IP services failed, returning 'unknown'");
    IpGeoResult { ip: "unknown".to_string(), country: "unknown".to_string(), region: "unknown".to_string(), city: "unknown".to_string() }
}

/// Get IP location/geo info, returns (country, region, city)
fn get_ip_geo_info(ip: &str) -> (String, String, String) {
    if ip == "unknown" {
        debug!(module="usage_report", "IP is 'unknown', skipping geo lookup");
        return ("unknown".to_string(), "unknown".to_string(), "unknown".to_string());
    }

    let url = format!("http://ip-api.com/json/{}?fields=status,country,regionName,city", ip);
    debug!(module="usage_report", "Getting geo info for IP: {} from {}", ip, url);

    match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(client) => {
            match client.get(&url).header("Accept", "application/json").send() {
                Ok(response) => {
                    let status = response.status();
                    debug!(module="usage_report", "Geo API returned status: {}", status);

                    match response.json::<serde_json::Value>() {
                        Ok(json_response) => {
                            debug!(module="usage_report", "Geo API response: {:?}", json_response);

                            if json_response.get("status").and_then(|s| s.as_str()) == Some("success") {
                                let country = json_response.get("country").and_then(|c| c.as_str()).unwrap_or("").to_string();
                                let region = json_response.get("regionName").and_then(|r| r.as_str()).unwrap_or("").to_string();
                                let city = json_response.get("city").and_then(|c| c.as_str()).unwrap_or("").to_string();

                                debug!(module="usage_report", "Geo info: country={}, region={}, city={}", country, region, city);
                                return (country, region, city);
                            } else {
                                debug!(module="usage_report", "Geo API returned failure status");
                            }
                        }
                        Err(e) => {
                            debug!(module="usage_report", "Failed to parse geo API response: {}", e);
                        }
                    }
                }
                Err(e) => {
                    debug!(module="usage_report", "Geo API request failed: {}", e);
                }
            }
        }
        Err(e) => {
            debug!(module="usage_report", "Failed to create geo API client: {}", e);
        }
    }

    ("unknown".to_string(), "unknown".to_string(), "unknown".to_string())
}

/// Collect system usage information
fn collect_usage_info(machine_code: &str) -> UsageReport {
    let app_version = env!("CARGO_PKG_VERSION").to_string();

    let os_name = System::name().unwrap_or_else(|| "Unknown".to_string());
    let os_version = System::os_version().unwrap_or_else(|| "Unknown".to_string());

    // 获取 IP 和地理位置（优先使用 IP 服务返回的地理位置）
    let ip_geo = get_public_ip_with_geo();
    let (country, region, city) = if ip_geo.country == "unknown" {
        // 如果 IP 服务没有提供地理位置，使用备用服务
        get_ip_geo_info(&ip_geo.ip)
    } else {
        (ip_geo.country, ip_geo.region, ip_geo.city)
    };

    let report_date = Local::now().format("%Y-%m-%d").to_string();

    UsageReport {
        project: "zupu".to_string(),
        app_version,
        machine_code: machine_code.to_string(),
        os_name,
        os_version,
        public_ip: ip_geo.ip,
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
    info!(module="usage_report", "Starting usage report check...");
    info!(module="usage_report", "Report URL: {}", USAGE_REPORT_URL);

    let machine_code = generate_machine_code();

    let current_report = collect_usage_info(&machine_code);
    info!(module="usage_report", "Collected info - Machine: {}, IP: {}, Country: {}, Region: {}, City: {}", current_report.machine_code, current_report.public_ip, current_report.country, current_report.region, current_report.city);

    let pending = match get_pending_reports(&db) {
        Ok(p) => p,
        Err(e) => {
            warn!(module="usage_report", "Failed to get pending reports: {}", e);
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

    info!(module="usage_report", "Total reports to send: {} (1 current + {} pending)", all_reports.len(), pending.len());

    let rt = tokio::runtime::Runtime::new().expect("Failed to create runtime");
    let result = rt.block_on(async {
        send_report_to_server(all_reports, USAGE_REPORT_URL).await
    });

    match result {
        Ok(()) => {
            info!(module="usage_report", "Report sent successfully, clearing pending reports...");
            if let Err(e) = clear_pending_reports(&db) {
                warn!(module="usage_report", "Failed to clear pending reports: {}", e);
            }
        }
        Err(e) => {
            warn!(module="usage_report", "Failed to send report: {}, saving to pending...", e);
            if let Err(e) = save_pending_report(&db, &current_report) {
                warn!(module="usage_report", "Failed to save pending report: {}", e);
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
            info!(module="usage_report", "Next report scheduled in {} seconds (at 12:00)", duration_until_noon);

            std::thread::sleep(std::time::Duration::from_secs(duration_until_noon));

            check_and_report(db.clone());

            info!(module="usage_report", "Next report in 24 hours...");
            std::thread::sleep(std::time::Duration::from_secs(24 * 60 * 60));
        }
    });
}