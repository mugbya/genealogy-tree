use axum::{
    extract::Extension,
    routing::{delete, get, post, put},
    Router,
};
use std::{path::PathBuf, sync::{Arc, Mutex}};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::fs::ServeDir;
use axum::routing::get_service;
use rusqlite::Connection;
use tauri::AppHandle;

use crate::api::handlers;
use crate::api::handlers::wechat::SharedWechatStore;

// 应用状态
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub wechat_store: SharedWechatStore,
    pub app_handle: Option<AppHandle>,
}

pub fn create_router(
    db: Arc<Mutex<Connection>>,
    wechat_store: SharedWechatStore,
    dist_path: Option<PathBuf>,
    app_handle: Option<AppHandle>,
) -> Router {
    let app_handle_clone = app_handle.clone();

    let state = AppState { db, wechat_store, app_handle: app_handle_clone };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let mut api_router = Router::new()
        // Health check
        .route("/api/health", get(handlers::health_check))
        // Auth (public)
        .route("/api/auth/register", post(handlers::auth::register))
        .route("/api/auth/login", post(handlers::auth::login))
        // WeChat login
        .route("/api/auth/wechat/qrcode", get(handlers::generate_qrcode))
        .route("/api/auth/wechat/status/:scene", get(handlers::check_login_status))
        .route("/api/auth/wechat/confirm", post(handlers::simulate_scan_confirm))
        .route("/api/auth/wechat/callback", get(handlers::wechat_callback))
        // Security (auth required)
        .route("/api/auth/login-history", get(handlers::auth::get_login_history))
        .route("/api/auth/revoke-all", post(handlers::auth::revoke_all_tokens))
        // Users (auth required)
        .route("/api/users/me", get(handlers::auth::get_current_user))
        .route("/api/users/:id", put(handlers::auth::update_user))
        .route("/api/users/:id", delete(handlers::auth::delete_user))
        .route("/api/users/:id/password", put(handlers::auth::change_password))
        // Admin only
        .route("/api/admin/users", get(handlers::auth::get_users))
        // Config (public for reading, auth for writing)
        .route("/api/config", get(handlers::config::get_all_configs))
        .route("/api/config/:key", get(handlers::config::get_config))
        .route("/api/config", post(handlers::config::set_config))
        .route("/api/config/batch", post(handlers::config::set_configs_batch))
        .route("/api/config/:key", delete(handlers::config::delete_config))
        .route("/api/config/public", get(handlers::config::get_public_config))
        // Members (public for now, can add auth later)
        .route("/api/members", get(handlers::get_members))
        .route("/api/members", post(handlers::create_member))
        .route("/api/members/:id", get(handlers::get_member))
        .route("/api/members/:id", put(handlers::update_member))
        .route("/api/members/:id", delete(handlers::delete_member))
        .route("/api/members/import", post(handlers::import_members))
        .route("/api/members/recalculate-generations", post(handlers::recalculate_all_generations))
        .route("/api/members/editable-ids", get(handlers::get_editable_member_ids))
        // Member relations
        .route("/api/member-relations", get(handlers::get_member_relations))
        .route("/api/member-relations", post(handlers::create_member_relation))
        .route("/api/member-relations/:id", delete(handlers::delete_member_relation))
        .route("/api/members/:member_id/relations", get(handlers::get_member_relations_by_member))
        // Relation tags
        .route("/api/relation-tags", get(handlers::get_relation_tags))
        .route("/api/relation-tags", post(handlers::create_relation_tag))
        .route("/api/relation-tags/:id", put(handlers::update_relation_tag))
        .route("/api/relation-tags/:id", delete(handlers::delete_relation_tag))
        // System info (public - no auth required)
        .route("/api/system/info", get(handlers::get_system_info))
        .route("/api/system/network-interfaces", get(handlers::get_network_interfaces))
        .route("/api/system/database-path", get(handlers::system::get_database_info))
        .route("/api/system/http-port", get(handlers::system::get_http_port))
        .route("/api/system/download-path", get(handlers::system::get_download_path))
        .route("/api/system/version", get(handlers::system::get_version))
        // License (public - no auth required)
        .route("/api/license/info", get(handlers::get_license_info))
        .route("/api/license/features", get(handlers::get_features))
        .route("/api/license/activate", post(handlers::activate_license))
        .route("/api/license/verify", post(handlers::verify_license))
        .route("/api/license/check-feature", post(handlers::check_feature))
        // Export (with license check)
        .route("/api/export/html", post(handlers::export_html));

    // 如果有 AppHandle，注入到 Extension 中用于模板下载和数据库路径获取
    let app_for_extension = app_handle.clone();
    let app_for_templates = app_handle.clone();
    if let Some(app) = app_for_extension {
        api_router = api_router.layer(Extension(app));
    }

    if let Some(app) = app_for_templates {
        // Templates 需要 AppHandle
        api_router = api_router.route("/api/templates/:name", get(handlers::download_template));
    }

    let api_router = if let Some(dist_path) = dist_path {
        let static_service = get_service(ServeDir::new(dist_path));
        api_router.layer(cors).fallback(static_service)
    } else {
        api_router.layer(cors)
    };

    api_router.with_state(state)
}
