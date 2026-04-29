use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde_json::{json, Value};

use crate::api::router::AppState;
use crate::license::{self as license_module, LicenseFeature};

pub async fn get_license_info(
    State(state): State<AppState>,
) -> (StatusCode, Json<Value>) {
    let result = license_module::get_license_info(&state.db);

    match result {
        Ok(info) => (StatusCode::OK, Json(json!({
            "data": {
                "license_key": info.license_key,
                "license_type": info.license_type,
                "activated_at": info.activated_at,
                "expires_at": info.expires_at,
                "is_valid": info.is_valid
            }
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

pub async fn check_feature(
    State(state): State<AppState>,
    Json(req): Json<serde_json::Value>,
) -> (StatusCode, Json<Value>) {
    #[derive(serde::Deserialize)]
    struct CheckFeatureRequest {
        feature: String,
    }

    let req: CheckFeatureRequest = match serde_json::from_value(req) {
        Ok(r) => r,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "无效的请求" }))),
    };

    // Parse feature
    let feature = match req.feature.as_str() {
        "export_html" => LicenseFeature::ExportHtml,
        "export_word" => LicenseFeature::ExportWord,
        "export_volume" => LicenseFeature::ExportVolume,
        _ => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "未知的功能" }))),
    };

    // Get license info
    let license_info = match license_module::get_license_info(&state.db) {
        Ok(info) => info,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
    };

    let allowed = license_module::is_feature_allowed(
        feature,
        license_info.license_key.as_deref(),
        license_info.expires_at.as_deref(),
    );

    (StatusCode::OK, Json(json!({
        "data": {
            "feature": req.feature,
            "allowed": allowed,
            "is_valid": license_info.is_valid,
            "expires_at": license_info.expires_at
        }
    })))
}