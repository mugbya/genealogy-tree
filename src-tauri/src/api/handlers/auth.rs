use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use rusqlite::params;
use serde_json::{json, Value};

use crate::api::router::AppState;
use crate::auth::{create_token, hash_password, verify_password, verify_token};
use crate::models::{
    CreateUserRequest, LoginRequest, LoginResponse, ROLE_ADMIN, ROLE_USER, User, UserResponse,
    UserResponseWithMemberName, JwtClaims,
};

fn extract_auth(headers: &HeaderMap) -> Result<(i64, String, JwtClaims), (StatusCode, Json<Value>)> {
    let token = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .map(|s| s.to_string())
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, Json(json!({ "error": "Missing authorization header" }))))?;

    let claims = verify_token(&token)
        .map_err(|_| (StatusCode::UNAUTHORIZED, Json(json!({ "error": "Invalid token" }))))?;

    Ok((claims.sub, claims.role.clone(), claims))
}

// 获取客户端 IP
fn get_client_ip(headers: &HeaderMap) -> String {
    // 优先从 X-Forwarded-For 获取（可能是代理或负载均衡）
    if let Some(v) = headers.get("X-Forwarded-For") {
        if let Ok(s) = v.to_str() {
            if !s.is_empty() {
                return s.split(',').next().unwrap_or(s).trim().to_string();
            }
        }
    }
    // 其次从 X-Real-IP 获取
    if let Some(v) = headers.get("X-Real-IP") {
        if let Ok(s) = v.to_str() {
            if !s.is_empty() {
                return s.to_string();
            }
        }
    }
    // 都没有则返回 "本机"（桌面应用直连的情况）
    "本机".to_string()
}

pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<CreateUserRequest>,
) -> (StatusCode, Json<Value>) {
    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let password_hash = match hash_password(&req.password) {
        Ok(hash) => hash,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let role = req.role.unwrap_or_else(|| ROLE_USER.to_string());

    let result = conn.execute(
        "INSERT INTO users (username, password_hash, role, member_id) VALUES (?1, ?2, ?3, ?4)",
        params![req.username, password_hash, role, req.member_id],
    );

    match result {
        Ok(_) => {
            let id = conn.last_insert_rowid();
            // 注册成功后自动登录，生成 token
            match create_token(id, &req.username, &role) {
                Ok(token) => {
                    let user = UserResponse {
                        id,
                        username: req.username,
                        role,
                        member_id: req.member_id,
                        created_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                    };
                    let response = LoginResponse { token, user };
                    (StatusCode::CREATED, Json(json!({ "data": response })))
                }
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
            }
        }
        Err(e) => {
            if e.to_string().contains("UNIQUE constraint") {
                (StatusCode::CONFLICT, Json(json!({ "error": "Username already exists" })))
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            }
        }
    }
}

pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<LoginRequest>,
) -> (StatusCode, Json<Value>) {
    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let ip_address = get_client_ip(&headers);
    let user_agent = headers
        .get("User-Agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_default();

    let result = conn.query_row(
        "SELECT id, username, password_hash, role, member_id, created_at, updated_at FROM users WHERE username = ?",
        params![req.username],
        |row| {
            Ok(User {
                id: row.get(0)?,
                username: row.get(1)?,
                password_hash: row.get(2)?,
                role: row.get(3)?,
                member_id: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        },
    );

    match result {
        Ok(user) => {
            match verify_password(&req.password, &user.password_hash) {
                Ok(true) => {
                    match create_token(user.id, &user.username, &user.role) {
                        Ok(token) => {
                            // 记录成功登录
                            let _ = conn.execute(
                                "INSERT INTO login_history (user_id, ip_address, user_agent, login_status) VALUES (?, ?, ?, ?)",
                                params![user.id, ip_address, user_agent, "success"],
                            );
                            let response = LoginResponse {
                                token,
                                user: user.into(),
                            };
                            (StatusCode::OK, Json(json!({ "data": response })))
                        }
                        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
                    }
                }
                Ok(false) => {
                    // 记录失败登录
                    let _ = conn.execute(
                        "INSERT INTO login_history (user_id, ip_address, user_agent, login_status, fail_reason) VALUES (?, ?, ?, ?, ?)",
                        params![user.id, ip_address, user_agent, "failed", "invalid_password"],
                    );
                    (StatusCode::UNAUTHORIZED, Json(json!({ "error": "Invalid credentials" })))
                }
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
            }
        }
        Err(_) => {
            // 用户不存在也记录（尝试查找用户id用于记录）
            let user_id: Result<i64, _> = conn.query_row(
                "SELECT id FROM users WHERE username = ?",
                params![req.username],
                |row| row.get(0),
            );
            let _ = conn.execute(
                "INSERT INTO login_history (user_id, ip_address, user_agent, login_status, fail_reason) VALUES (?, ?, ?, ?, ?)",
                params![user_id.unwrap_or(0), ip_address, user_agent, "failed", "user_not_found"],
            );
            (StatusCode::UNAUTHORIZED, Json(json!({ "error": "Invalid credentials" })))
        }
    }
}

pub async fn get_users(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> (StatusCode, Json<Value>) {
    let (_, role, _) = match extract_auth(&headers) {
        Ok(v) => v,
        Err(e) => return e,
    };

    if role != ROLE_ADMIN {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Admin access required" })));
    }

    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let mut stmt = match conn.prepare(
        "SELECT u.id, u.username, u.role, u.member_id, u.created_at, fm.name as member_name
         FROM users u
         LEFT JOIN family_members fm ON u.member_id = fm.id
         ORDER BY u.id"
    ) {
        Ok(stmt) => stmt,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let users = stmt.query_map([], |row| {
        Ok(UserResponseWithMemberName {
            id: row.get(0)?,
            username: row.get(1)?,
            role: row.get(2)?,
            member_id: row.get(3)?,
            created_at: row.get(4)?,
            member_name: row.get(5)?,
        })
    });

    match users {
        Ok(rows) => {
            let result: Vec<UserResponseWithMemberName> = rows.filter_map(|r| r.ok()).collect();
            (StatusCode::OK, Json(json!({ "data": result })))
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

pub async fn get_current_user(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> (StatusCode, Json<Value>) {
    let (user_id, _, _) = match extract_auth(&headers) {
        Ok(v) => v,
        Err(e) => return e,
    };

    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let result = conn.query_row(
        "SELECT id, username, role, member_id, created_at FROM users WHERE id = ?",
        params![user_id],
        |row| {
            Ok(UserResponse {
                id: row.get(0)?,
                username: row.get(1)?,
                role: row.get(2)?,
                member_id: row.get(3)?,
                created_at: row.get(4)?,
            })
        },
    );

    match result {
        Ok(user) => (StatusCode::OK, Json(json!({ "data": user }))),
        Err(_) => (StatusCode::NOT_FOUND, Json(json!({ "error": "User not found" }))),
    }
}

#[derive(serde::Deserialize)]
pub struct UpdateUserRequestWithAuth {
    pub password: Option<String>,
    pub role: Option<String>,
    pub member_id: Option<i64>,
}

pub async fn update_user(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    headers: HeaderMap,
    Json(req): Json<UpdateUserRequestWithAuth>,
) -> (StatusCode, Json<Value>) {
    // 从 token 中获取当前用户信息
    let (current_user_id, current_user_role, _) = match extract_auth(&headers) {
        Ok(v) => v,
        Err(e) => return e,
    };

    // 非管理员只能修改自己的信息
    if current_user_role != ROLE_ADMIN && current_user_id != id {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Cannot update other users" })));
    }

    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let mut updates: Vec<&str> = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref password) = req.password {
        let hash = match hash_password(password) {
            Ok(h) => h,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
        };
        updates.push("password_hash = ?");
        values.push(Box::new(hash));
    }

    if let Some(ref new_role) = req.role {
        if current_user_role != ROLE_ADMIN {
            return (StatusCode::FORBIDDEN, Json(json!({ "error": "Only admin can change roles" })));
        }
        updates.push("role = ?");
        values.push(Box::new(new_role.clone()));
    }

    if let Some(ref member_id) = req.member_id {
        updates.push("member_id = ?");
        values.push(Box::new(*member_id));
    }

    if updates.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "No fields to update" })));
    }

    updates.push("updated_at = datetime('now')");

    values.push(Box::new(id));
    let sql = format!("UPDATE users SET {} WHERE id = ?", updates.join(", "));

    let result = conn.execute(&sql, rusqlite::params_from_iter(values.iter()));

    match result {
        Ok(rows) if rows > 0 => (StatusCode::OK, Json(json!({ "success": true }))),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({ "error": "User not found" }))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

pub async fn delete_user(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    headers: HeaderMap,
) -> (StatusCode, Json<Value>) {
    let (_, role, _) = match extract_auth(&headers) {
        Ok(v) => v,
        Err(e) => return e,
    };

    if role != ROLE_ADMIN {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Admin access required" })));
    }

    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let result = conn.execute("DELETE FROM users WHERE id = ?", params![id]);

    match result {
        Ok(rows) if rows > 0 => (StatusCode::OK, Json(json!({ "success": true }))),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({ "error": "User not found" }))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

// 修改密码请求体
#[derive(serde::Deserialize)]
pub struct ChangePasswordRequest {
    pub old_password: String,
    pub new_password: String,
}

// 修改密码
pub async fn change_password(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    headers: HeaderMap,
    Json(req): Json<ChangePasswordRequest>,
) -> (StatusCode, Json<Value>) {
    let (current_user_id, current_user_role, _) = match extract_auth(&headers) {
        Ok(v) => v,
        Err(e) => return e,
    };

    // 非管理员只能修改自己的密码
    if current_user_role != ROLE_ADMIN && current_user_id != id {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Cannot change other users password" })));
    }

    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    // 获取用户的当前密码哈希
    let user = match conn.query_row(
        "SELECT id, password_hash FROM users WHERE id = ?",
        params![id],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
    ) {
        Ok(u) => u,
        Err(_) => return (StatusCode::NOT_FOUND, Json(json!({ "error": "User not found" }))),
    };

    // 验证旧密码
    match verify_password(&req.old_password, &user.1) {
        Ok(true) => {}
        Ok(false) => return (StatusCode::FORBIDDEN, Json(json!({ "error": "Old password is incorrect" }))),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
    }

    // 哈希新密码
    let new_hash = match hash_password(&req.new_password) {
        Ok(h) => h,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
    };

    // 更新密码
    let result = conn.execute(
        "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
        params![new_hash, id],
    );

    match result {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

// 登录历史记录结构
#[derive(serde::Serialize)]
pub struct LoginHistoryItem {
    pub id: i64,
    pub user_id: i64,
    pub username: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub login_status: String,
    pub fail_reason: Option<String>,
    pub created_at: String,
}

// 获取登录历史
pub async fn get_login_history(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> (StatusCode, Json<Value>) {
    let (current_user_id, role, _) = match extract_auth(&headers) {
        Ok(v) => v,
        Err(e) => return e,
    };

    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    // 管理员可以查看所有登录历史，普通用户只能查看自己的
    let sql = "SELECT lh.id, lh.user_id, u.username, lh.ip_address, lh.user_agent, lh.login_status, lh.fail_reason, lh.created_at
         FROM login_history lh
         LEFT JOIN users u ON lh.user_id = u.id
         WHERE (? = 'admin' OR lh.user_id = ?)
         ORDER BY lh.created_at DESC
         LIMIT 100";

    let mut stmt = match conn.prepare(sql) {
        Ok(stmt) => stmt,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let rows = stmt.query_map(params![role, current_user_id], |row| {
        Ok(LoginHistoryItem {
            id: row.get(0)?,
            user_id: row.get(1)?,
            username: row.get(2)?,
            ip_address: row.get(3)?,
            user_agent: row.get(4)?,
            login_status: row.get(5)?,
            fail_reason: row.get(6)?,
            created_at: row.get(7)?,
        })
    });

    match rows {
        Ok(rows) => {
            let result: Vec<LoginHistoryItem> = rows.filter_map(|r| r.ok()).collect();
            (StatusCode::OK, Json(json!({ "data": result })))
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

// 撤销所有 token（管理员）
pub async fn revoke_all_tokens(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> (StatusCode, Json<Value>) {
    let (_, role, _) = match extract_auth(&headers) {
        Ok(v) => v,
        Err(e) => return e,
    };

    if role != ROLE_ADMIN {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Admin access required" })));
    }

    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    // 获取当前时间
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // 计算 token 过期时间（7天后）
    let expires_at = chrono::Local::now()
        .checked_add_signed(chrono::Duration::hours(24 * 7))
        .expect("valid timestamp")
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();

    // 插入一个特殊的撤销记录（表示"撤销所有"）
    let result = conn.execute(
        "INSERT INTO revoked_tokens (token_jti, revoked_at, expires_at) VALUES ('__revoke_all__', ?, ?)",
        params![now, expires_at],
    );

    match result {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true, "message": "All tokens have been revoked. All users need to re-login." }))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}
