#![allow(unknown_lints)]

mod api;
mod auth;
mod constants;
mod db;
mod license;
mod models;
mod utils;

use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use tauri::Manager;
use serde::Serialize;
use tracing::{info, warn};
use tracing_subscriber::{fmt, prelude::*, registry};
use tracing_appender::rolling::{RollingFileAppender, Rotation};

pub use models::*;
pub use api::*;
pub use auth::*;
pub use license::*;

// 单个 CPU 核心信息
#[derive(Serialize, Clone)]
pub struct CpuCore {
    pub name: String,
    pub usage: f32,
}

// 单个磁盘信息
#[derive(Serialize, Clone)]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub total: u64,
    pub used: u64,
    pub usage: f32,
}

// 网卡信息
#[derive(Serialize, Clone)]
pub struct NetworkInterface {
    pub name: String,
    pub ip: String,
    pub is_loopback: bool,
}

// 系统信息结构
#[derive(Serialize)]
pub struct SystemInfo {
    pub version: String,
    pub cpu_cores: Vec<CpuCore>,
    pub memory_usage: f32,
    pub total_memory: u64,
    pub used_memory: u64,
    pub disks: Vec<DiskInfo>,
    pub platform: String,
}

// 获取网络接口信息
#[tauri::command]
fn get_network_interfaces() -> Vec<NetworkInterface> {
    let mut interfaces = Vec::new();

    if let Ok(addrs) = if_addrs::get_if_addrs() {
        for iface in addrs {
            // 只显示 IPv4 地址
            if let std::net::IpAddr::V4(ipv4) = iface.addr.ip() {
                interfaces.push(NetworkInterface {
                    name: iface.name.clone(),
                    ip: ipv4.to_string(),
                    is_loopback: ipv4.is_loopback(),
                });
            }
        }
    }

    interfaces
}

// 获取下载目录路径
#[tauri::command]
fn get_download_path() -> String {
    dirs_next::download_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "下载文件夹".to_string())
}

// 下载模板文件
#[tauri::command]
async fn download_template(template_name: String, app: tauri::AppHandle) -> Result<Vec<u8>, String> {
    // 模板文件路径 - 使用 resource_path 获取打包后的资源路径
    let resource_path = app.path().resource_dir().map_err(|e| e.to_string())?;
    let template_path = resource_path.join("templates").join(&template_name);

    // 读取文件内容
    tokio::fs::read(&template_path)
        .await
        .map_err(|e| format!("读取模板文件失败: {}", e))
}

// 数据库路径信息
#[derive(Serialize)]
pub struct DatabasePathInfo {
    pub path: String,
    pub os_type: String,  // macos, linux, windows
}

// 获取数据库存储路径
#[tauri::command]
fn get_database_path(app: tauri::AppHandle) -> Result<DatabasePathInfo, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join(".genealogy.db");

    // 判断操作系统类型
    let os_type = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "unknown"
    };

    Ok(DatabasePathInfo {
        path: db_path.to_string_lossy().to_string(),
        os_type: os_type.to_string(),
    })
}

// 获取 HTTP 端口配置（供前端使用）
#[tauri::command]
fn get_http_port(app: tauri::AppHandle) -> String {
    let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
    let db_path = app_data_dir.join(".genealogy.db");

    if let Ok(conn) = rusqlite::Connection::open(&db_path) {
        let result: Result<String, _> = conn.query_row(
            "SELECT value FROM family_config WHERE key = 'http_port'",
            [],
            |row| row.get::<_, String>(0),
        );
        result.unwrap_or_else(|_| "8089".to_string())
    } else {
        "8089".to_string()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing with file logging
    let app_data_dir = dirs_next::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.mugbya.genealogy")
        .join("logs");
    std::fs::create_dir_all(&app_data_dir).ok();

    let file_appender = RollingFileAppender::new(
        Rotation::DAILY,
        &app_data_dir,
        "genealogy.log",
    );
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    let file_layer = fmt::layer()
        .with_writer(non_blocking)
        .with_ansi(false);

    registry()
        .with(fmt::layer().with_writer(std::io::stderr))
        .with(file_layer)
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![get_network_interfaces, get_download_path, get_database_path, download_template, get_http_port])
        .setup(|app| {
            // 获取应用数据目录，使用绝对路径初始化数据库
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
            let db_path = app_data_dir.join(".genealogy.db");
            info!(module="lib", "Database path: {:?}", db_path);

            let conn = db::init_database(&db_path).expect("Failed to initialize database");
            let db = Arc::new(Mutex::new(conn));
            let http_db = db.clone();

            // 创建微信登录状态存储
            let wechat_store = Arc::new(Mutex::new(api::WechatLoginStore::default()));
            let http_wechat_store = wechat_store.clone();

            // 启动使用情况上报定时器
            let report_db = db.clone();
            info!(module="lib", "Starting usage report timer...");
            api::start_report_timer(report_db);

            // 获取 dist 目录路径（在 spawn 线程之前）
            let dist_path = if cfg!(debug_assertions) {
                // Debug 模式：从项目根目录的 dist
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("..")
                    .join("..")
                    .join("dist")
            } else {
                // Release 模式：使用 tauri 的资源目录
                app.path().resource_dir()
                    .expect("Failed to get resource dir")
                    .join("dist")
            };
            info!(module="lib", "Static files path: {:?}", dist_path);

            // 获取 AppHandle 用于模板下载
            let app_handle = app.handle().clone();

            // 获取 HTTP 端口配置
            let http_port = {
                let conn = db.lock().unwrap();
                let result: Result<String, _> = conn.query_row(
                    "SELECT value FROM family_config WHERE key = 'http_port'",
                    [],
                    |row| row.get::<_, String>(0),
                );
                match result {
                    Ok(port) => {
                        info!(module="lib", "Loaded http_port from config: {}", port);
                        port
                    }
                    Err(e) => {
                        warn!(module="lib", "Failed to load http_port from config: {}, using default 8089", e);
                        "8089".to_string()
                    }
                }
            };

            // 获取 HTTPS 端口配置（暂未启用，为将来扩展留用）
            let _https_port = {
                let conn = db.lock().unwrap();
                let result: Result<String, _> = conn.query_row(
                    "SELECT value FROM family_config WHERE key = 'https_port'",
                    [],
                    |row| row.get::<_, String>(0),
                );
                result.unwrap_or_else(|_| "8443".to_string())
            };
            info!(module="lib", "Starting HTTP server on http://localhost:{}", http_port);
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().expect("Failed to create runtime");
                rt.block_on(async {
                    let app = api::create_router(http_db, http_wechat_store, Some(dist_path), Some(app_handle));
                    let bind_addr = format!("0.0.0.0:{}", http_port);
                    let listener = tokio::net::TcpListener::bind(&bind_addr).await.expect("Failed to bind port");
                    info!(module="lib", "HTTP server running on http://localhost:{}", http_port);
                    axum::serve(listener, app).await.expect("HTTP server error");
                });
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
