mod api;
mod auth;
mod constants;
mod db;
mod license;
mod models;

use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use tauri::Manager;
use serde::Serialize;
use sysinfo::{System, Disks};
use tauri_plugin_updater::UpdaterExt;

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

// 获取系统信息命令
#[tauri::command]
fn get_system_info() -> SystemInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    // CPU 核心信息
    let cpus = sys.cpus();
    let cpu_cores: Vec<CpuCore> = cpus.iter().enumerate().map(|(i, cpu)| {
        CpuCore {
            name: format!("Core {}", i),
            usage: cpu.cpu_usage(),
        }
    }).collect();

    // 内存使用率
    let total_memory = sys.total_memory();
    let used_memory = sys.used_memory();
    let memory_usage = if total_memory > 0 {
        (used_memory as f32 / total_memory as f32) * 100.0
    } else {
        0.0
    };

    // 磁盘信息 (所有磁盘，去重)
    let disks = Disks::new_with_refreshed_list();
    let mut seen_mount_points: std::collections::HashSet<String> = std::collections::HashSet::new();
    let disk_list: Vec<DiskInfo> = disks.list().iter()
        .filter(|disk| {
            let mount = disk.mount_point().to_string_lossy().to_string();
            seen_mount_points.insert(mount)
        })
        .map(|disk| {
            let total = disk.total_space();
            let available = disk.available_space();
            let used = total.saturating_sub(available);
            let usage = if total > 0 {
                (used as f32 / total as f32) * 100.0
            } else {
                0.0
            };
            DiskInfo {
                name: disk.name().to_string_lossy().to_string(),
                mount_point: disk.mount_point().to_string_lossy().to_string(),
                total,
                used,
                usage,
            }
        }).collect();

    // 平台
    let platform = System::name().unwrap_or_else(|| "Unknown".to_string());
    let os_version = System::os_version().unwrap_or_else(|| "Unknown".to_string());

    SystemInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        cpu_cores,
        memory_usage,
        total_memory,
        used_memory,
        disks: disk_list,
        platform: format!("{} {}", platform, os_version),
    }
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![get_system_info, get_network_interfaces, get_download_path, get_database_path, download_template])
        .setup(|app| {
            // 获取应用数据目录，使用绝对路径初始化数据库
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
            let db_path = app_data_dir.join(".genealogy.db");
            eprintln!("[genealogy] Database path: {:?}", db_path);

            let conn = db::init_database(&db_path).expect("Failed to initialize database");
            let db = Arc::new(Mutex::new(conn));
            let http_db = db.clone();

            // 创建微信登录状态存储
            let wechat_store = Arc::new(Mutex::new(api::WechatLoginStore::default()));
            let http_wechat_store = wechat_store.clone();

            // 启动使用情况上报定时器
            let report_db = db.clone();
            eprintln!("[genealogy] Starting usage report timer...");
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
            eprintln!("[genealogy] Static files path: {:?}", dist_path);

            // 获取 AppHandle 用于模板下载
            let app_handle = app.handle().clone();

            eprintln!("[genealogy] Starting HTTP server on http://localhost:8080");
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().expect("Failed to create runtime");
                rt.block_on(async {
                    let app = api::create_router(http_db, http_wechat_store, Some(dist_path), Some(app_handle));
                    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.expect("Failed to bind port 8080");
                    eprintln!("[genealogy] HTTP server running on http://localhost:8080");
                    axum::serve(listener, app).await.expect("HTTP server error");
                });
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
