use axum::{http::StatusCode, Json};
use serde_json::{json, Value};
use sysinfo::{System, Disks};

use crate::{CpuCore, DiskInfo, NetworkInterface, SystemInfo};

// 获取系统信息
pub async fn get_system_info() -> (StatusCode, Json<Value>) {
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

    let system_info = SystemInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        cpu_cores,
        memory_usage,
        total_memory,
        used_memory,
        disks: disk_list,
        platform: format!("{} {}", platform, os_version),
    };

    (StatusCode::OK, Json(json!({ "data": system_info })))
}

// 获取网络接口信息
pub async fn get_network_interfaces() -> (StatusCode, Json<Value>) {
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

    (StatusCode::OK, Json(json!({ "data": interfaces })))
}
