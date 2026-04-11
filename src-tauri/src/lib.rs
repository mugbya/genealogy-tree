mod api;
mod auth;
mod db;
mod models;

use std::sync::{Arc, Mutex};
use std::path::PathBuf;

pub use models::*;
pub use api::*;
pub use auth::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化数据库
    let db_path = PathBuf::from(".genealogy.db");
    let conn = db::init_database(&db_path).expect("Failed to initialize database");
    let db = Arc::new(Mutex::new(conn));

    // 克隆 db 用于 HTTP 服务器
    let http_db = db.clone();

    // 启动 axum HTTP 服务器
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let app = api::create_router(http_db);
            let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
            println!("HTTP server running on http://localhost:8080");
            axum::serve(listener, app).await.unwrap();
        });
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
