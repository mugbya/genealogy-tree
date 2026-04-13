use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::api::router::AppState;

// 微信开放平台配置
const DEFAULT_WECHAT_APPID: &str = "YOUR_WECHAT_APPID";
const DEFAULT_WECHAT_APPSECRET: &str = "YOUR_WECHAT_APPSECRET";
const CONFIG_WECHAT_APPID: &str = "wechat_appid";
const CONFIG_WECHAT_APPSECRET: &str = "wechat_appsecret";
const CONFIG_WECHAT_REDIRECT_URI: &str = "wechat_redirect_uri";

// 存储登录状态的内存结构
#[derive(Clone)]
pub struct WechatLoginState {
    pub scene: String,
    pub status: String, // pending, scanned, confirmed, expired
    pub openid: Option<String>,
    pub nickname: Option<String>,
    pub access_token: Option<String>,
    pub created_at: Instant,
}

#[derive(Default)]
pub struct WechatLoginStore {
    pub logins: HashMap<String, WechatLoginState>,
}

pub type SharedWechatStore = Arc<Mutex<WechatLoginStore>>;

#[derive(Serialize)]
pub struct QrcodeResponse {
    pub scene: String,
    pub qrcode_url: String,
    pub expire_seconds: u64,
}

#[derive(Deserialize)]
pub struct QrcodeQuery {
    pub redirect_uri: Option<String>,
}

// 获取微信配置
fn get_wechat_config(conn: &rusqlite::Connection) -> (String, String, String) {
    let get_config = |key: &str| -> String {
        conn.query_row(
            "SELECT value FROM family_config WHERE key = ?",
            [key],
            |row| row.get(0),
        )
        .unwrap_or_default()
    };

    let appid = get_config(CONFIG_WECHAT_APPID);
    let appsecret = get_config(CONFIG_WECHAT_APPSECRET);
    let redirect_uri = get_config(CONFIG_WECHAT_REDIRECT_URI);

    (
        if appid.is_empty() { DEFAULT_WECHAT_APPID.to_string() } else { appid },
        if appsecret.is_empty() { DEFAULT_WECHAT_APPSECRET.to_string() } else { appsecret },
        if redirect_uri.is_empty() { "http://localhost:8080/api/auth/wechat/callback".to_string() } else { redirect_uri },
    )
}

// 生成微信登录二维码
pub async fn generate_qrcode(
    State(state): State<AppState>,
    Query(query): Query<QrcodeQuery>,
) -> (StatusCode, Json<Value>) {
    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let (appid, _appsecret, redirect_uri) = get_wechat_config(&conn);

    // 如果使用默认 AppID，说明用户没有配置
    if appid == DEFAULT_WECHAT_APPID {
        return (StatusCode::BAD_REQUEST, Json(json!({
            "error": "请先在设置中配置微信登录参数"
        })));
    }

    // 生成随机场景字符串（state 参数）
    let scene = format!("{:032x}", rand::thread_rng().gen::<u128>());
    let expire_seconds = 300u64; // 5分钟过期

    let login_state = WechatLoginState {
        scene: scene.clone(),
        status: "pending".to_string(),
        openid: None,
        nickname: None,
        access_token: None,
        created_at: Instant::now(),
    };

    // 存储登录状态
    {
        let mut store = match state.wechat_store.lock() {
            Ok(s) => s,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
        };
        store.logins.insert(scene.clone(), login_state);
    }

    // 使用 redirect_uri 参数或者配置的回调地址
    let final_redirect_uri = query.redirect_uri.unwrap_or_else(|| redirect_uri.clone());

    // 构建微信 OAuth2 二维码 URL
    // 微信开放平台网站应用微信登录二维码 URL
    let qrcode_url = format!(
        "https://open.weixin.qq.com/connect/qrconnect?appid={}&redirect_uri={}&response_type=code&scope=snsapi_login&state={}#wechat_redirect",
        appid,
        urlencoding::encode(&final_redirect_uri),
        scene
    );

    let response = QrcodeResponse {
        scene,
        qrcode_url,
        expire_seconds,
    };

    (StatusCode::OK, Json(json!({ "data": response })))
}

// 查询登录状态 - 前端轮询此接口
#[derive(Serialize)]
pub struct LoginStatusResponse {
    pub status: String, // pending, scanned, confirmed, expired
    pub nickname: Option<String>,
    pub avatar: Option<String>,
}

pub async fn check_login_status(
    State(state): State<AppState>,
    Path(scene): Path<String>,
) -> (StatusCode, Json<Value>) {
    let store = match state.wechat_store.lock() {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    match store.logins.get(&scene) {
        Some(state) => {
            // 检查是否过期（5分钟）
            if state.created_at.elapsed() > Duration::from_secs(300) {
                return (StatusCode::OK, Json(json!({
                    "data": {
                        "status": "expired"
                    }
                })));
            }

            let response = LoginStatusResponse {
                status: state.status.clone(),
                nickname: state.nickname.clone(),
                avatar: None,
            };

            (StatusCode::OK, Json(json!({ "data": response })))
        }
        None => (StatusCode::NOT_FOUND, Json(json!({ "error": "Scene not found" }))),
    }
}

// 微信 OAuth 回调接口
// 微信扫码后会回调这个接口，带着 code 和 state 参数
pub async fn wechat_callback(
    State(state): State<AppState>,
    Query(params): Query<WechatCallbackParams>,
) -> (axum::http::StatusCode, String) {
    // 简化版本：直接返回错误，要求用户配置微信
    // 真实实现需要公网回调地址
    let _code = params.code.clone().unwrap_or_default();
    let _scene = params.state.clone().unwrap_or_default();
    let _conn = state.db.lock().unwrap();
    let (_appid, _appsecret, _) = get_wechat_config(&_conn);

    // 返回配置提示
    (axum::http::StatusCode::OK, "请在后台配置微信开放平台参数".to_string())
}

#[derive(Deserialize)]
pub struct WechatCallbackParams {
    pub code: Option<String>,
    pub state: Option<String>,
}

#[derive(Deserialize)]
pub struct WechatOAuthTokenResponse {
    pub access_token: String,
    pub expires_in: i32,
    pub refresh_token: String,
    pub openid: String,
    pub scope: String,
}

#[derive(Deserialize)]
pub struct WechatUserInfo {
    pub openid: String,
    pub nickname: String,
    pub sex: i32,
    pub province: String,
    pub city: String,
    pub country: String,
    pub headimgurl: Option<String>,
}

// 模拟扫码确认（测试用）
pub async fn simulate_scan_confirm(
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> (StatusCode, Json<Value>) {
    let scene = payload.get("scene")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let openid = payload.get("openid")
        .and_then(|v| v.as_str())
        .unwrap_or("mock_openid_123")
        .to_string();

    let nickname = payload.get("nickname")
        .and_then(|v| v.as_str())
        .unwrap_or("微信用户")
        .to_string();

    let mut store = match state.wechat_store.lock() {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    if let Some(state) = store.logins.get_mut(&scene) {
        state.status = "confirmed".to_string();
        state.openid = Some(openid.clone());
        state.nickname = Some(nickname.clone());

        // 生成平台token（简化处理，实际应该调用create_token）
        let token = format!("wechat_token_{}_{}", openid, scene);

        return (StatusCode::OK, Json(json!({
            "data": {
                "status": "confirmed",
                "token": token,
                "user": {
                    "openid": openid,
                    "nickname": nickname,
                }
            }
        })));
    }

    (StatusCode::NOT_FOUND, Json(json!({ "error": "Scene not found" })))
}

// 清理过期的登录状态
pub fn cleanup_expired_sessions(store: &mut WechatLoginStore) {
    store.logins.retain(|_, state| {
        state.created_at.elapsed() < Duration::from_secs(300)
    });
}
