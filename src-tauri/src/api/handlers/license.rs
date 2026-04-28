use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde_json::{json, Value};

use crate::api::router::AppState;
use crate::license as license_module;

pub async fn get_license_info(
    State(state): State<AppState>,
) -> (StatusCode, Json<Value>) {
    let result = license_module::get_license_info(&state.db);

    match result {
        Ok(info) => (StatusCode::OK, Json(json!({
            "license_key": info.license_key,
            "license_type": info.license_type,
            "activated_at": info.activated_at,
            "expires_at": info.expires_at,
            "is_valid": info.is_valid
        }))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
    }
}

pub async fn activate_license(
    State(state): State<AppState>,
    Json(req): Json<serde_json::Value>,
) -> (StatusCode, Json<Value>) {
    #[derive(serde::Deserialize)]
    struct ActivateRequest {
        license_key: String,
    }

    let req: ActivateRequest = match serde_json::from_value(req) {
        Ok(r) => r,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "无效的请求" }))),
    };

    let result = license_module::activate_license(
        state.db.clone(),
        &req.license_key,
    ).await;

    match result {
        Ok(status) => (StatusCode::OK, Json(json!({ "data": status }))),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))),
    }
}

pub async fn verify_license(
    State(state): State<AppState>,
) -> (StatusCode, Json<Value>) {
    let license_info = match license_module::get_license_info(&state.db) {
        Ok(info) => info,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
    };

    let license_key = match license_info.license_key {
        Some(key) => key,
        None => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "请先激活授权" }))),
    };

    let result = license_module::verify_license(
        state.db.clone(),
        &license_key,
    ).await;

    match result {
        Ok(status) => (StatusCode::OK, Json(json!({ "data": status }))),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))),
    }
}