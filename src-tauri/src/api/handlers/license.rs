use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde_json::{json, Value};
use tracing::warn;

use crate::api::router::AppState;
use crate::license::{self as license_module, LicenseFeature, get_remaining_days_by_ntp};

pub async fn get_license_info(
    State(state): State<AppState>,
) -> (StatusCode, Json<Value>) {
    let result = license_module::get_license_info(&state.db);

    match result {
        Ok(info) => {
            // If no license exists, request trial license from server
            let (license_key, auth_code, license_type, expires_at, is_valid, is_trial) = if info.license_key.is_none() {
                match license_module::get_or_generate_trial_license_async(state.db.clone()).await {
                    Ok((trial_key, trial_auth_code, trial_exp)) => (
                        Some(trial_key),
                        Some(trial_auth_code),
                        Some("trial".to_string()),
                        Some(trial_exp.clone()),
                        true, // Trial is valid until expired
                        true  // is_trial
                    ),
                    Err(e) => {
                        warn!(module="license_handler", "Failed to get trial license: {}", e);
                        (None, None, None, None, false, false)
                    }
                }
            } else {
                let is_trial = info.license_type.as_deref() == Some("trial");
                (info.license_key, info.auth_code, info.license_type, info.expires_at, info.is_valid, is_trial)
            };

            // Calculate remaining days using NTP time (for all license types, not just trial)
            let remaining_days = if let Some(ref exp) = expires_at {
                let days = get_remaining_days_by_ntp(exp);
                if days >= 0 { Some(days) } else { Some(0) } // Show 0 if expired
            } else {
                None
            };

            (StatusCode::OK, Json(json!({
                "data": {
                    "license_key": license_key,
                    "auth_code": auth_code,
                    "license_type": license_type,
                    "activated_at": info.activated_at,
                    "expires_at": expires_at,
                    "is_valid": is_valid,
                    "is_trial": is_trial,
                    "remaining_days": remaining_days
                }
            })))
        },
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
        Ok(status) => (StatusCode::OK, Json(json!({ "success": true, "data": status }))),
        Err(e) => (StatusCode::OK, Json(json!({ "success": false, "error": e }))),
    }
}

pub async fn check_feature(
    State(state): State<AppState>,
    Json(req): Json<serde_json::Value>,
) -> (StatusCode, Json<Value>) {
    #[derive(serde::Deserialize)]
    struct CheckFeatureRequest {
        // 支持单个 feature 或多个 features 数组
        feature: Option<String>,
        features: Option<Vec<String>>,
    }

    let req: CheckFeatureRequest = match serde_json::from_value(req) {
        Ok(r) => r,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "无效的请求" }))),
    };

    // 获取要检查的 feature 列表
    let features_to_check: Vec<String> = if let Some(features) = req.features {
        features
    } else if let Some(feature) = req.feature {
        vec![feature]
    } else {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "缺少 feature 或 features 参数" })));
    };

    // Get license info
    let license_info = match license_module::get_license_info(&state.db) {
        Ok(info) => info,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
    };

    // If no license exists, request trial license from server
    let (license_key, auth_code, expires_at, license_type) = if license_info.license_key.is_none() {
        match license_module::get_or_generate_trial_license_async(state.db.clone()).await {
            Ok((trial_key, trial_auth_code, trial_exp)) => (
                Some(trial_key),
                Some(trial_auth_code),
                Some(trial_exp),
                Some("trial".to_string())
            ),
            Err(e) => {
                warn!(module="license_handler", "Failed to get trial license: {}", e);
                (None, None, None, None)
            }
        }
    } else {
        (license_info.license_key.clone(), license_info.auth_code.clone(), license_info.expires_at.clone(), license_info.license_type.clone())
    };

    // Check each feature
    let mut results: Vec<Value> = Vec::new();
    for feature_str in features_to_check {
        let feature = match feature_str.as_str() {
            "export_html" => LicenseFeature::ExportHtml,
            "export_word" => LicenseFeature::ExportWord,
            "export_volume" => LicenseFeature::ExportVolume,
            _ => {
                results.push(json!({
                    "feature": feature_str,
                    "error": "未知的功能"
                }));
                continue;
            }
        };

        let allowed = license_module::is_feature_allowed(
            feature,
            auth_code.as_deref(),
            expires_at.as_deref(),
            license_type.as_deref(),
        );

        let is_trial_expired = license_key.as_ref()
            .map(|k| k.starts_with("GLT-"))
            .unwrap_or(false)
            && !allowed;

        results.push(json!({
            "feature": feature_str,
            "allowed": allowed,
            "is_valid": allowed,
            "expires_at": expires_at,
            "is_trial_expired": is_trial_expired
        }));
    }

    (StatusCode::OK, Json(json!({
        "data": {
            "results": results
        }
    })))
}
