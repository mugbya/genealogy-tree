mod api;
mod auth;
mod db;
mod models;

use std::sync::{Arc, Mutex};
use tauri::Manager;

pub use models::*;
pub use api::*;
pub use auth::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // 获取应用数据目录，使用绝对路径初始化数据库
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
            let db_path = app_data_dir.join(".genealogy.db");
            eprintln!("[genealogy] Database path: {:?}", db_path);

            let conn = db::init_database(&db_path).expect("Failed to initialize database");
            let db = Arc::new(Mutex::new(conn));
            let http_db = db.clone();

            eprintln!("[genealogy] Starting HTTP server on http://localhost:8080");
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().expect("Failed to create runtime");
                rt.block_on(async {
                    let app = api::create_router(http_db);
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
