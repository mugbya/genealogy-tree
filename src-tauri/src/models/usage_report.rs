use serde::{Deserialize, Serialize};

/// Usage report data structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageReport {
    pub app_version: String,
    pub os_name: String,
    pub os_version: String,
    pub public_ip: String,
    pub country: String,
    pub region: String,
    pub city: String,
    pub report_date: String,
}

/// Request body for batch report
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchReportRequest {
    pub reports: Vec<UsageReport>,
}

/// Pending report stored in database
#[derive(Debug, Clone)]
pub struct PendingReport {
    pub id: i64,
    pub report_data: String,
    pub report_date: String,
    pub created_at: i64,
}