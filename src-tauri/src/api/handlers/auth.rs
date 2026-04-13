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
};

fn extract_auth(headers: &HeaderMap) -> Result<(i64, String), (StatusCode, Json<Value>)> {
    let token = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .map(|s| s.to_string())
        .ok_or_else(|| (StatusCode::UNAUTHORIZED, Json(json!({ "error": "Missing authorization header" }))))?;

    let claims = verify_token(&token)
        .map_err(|_| (StatusCode::UNAUTHORIZED, Json(json!({ "error": "Invalid token" }))))?;

    Ok((claims.sub, claims.role))
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
    Json(req): Json<LoginRequest>,
) -> (StatusCode, Json<Value>) {
    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

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
                            let response = LoginResponse {
                                token,
                                user: user.into(),
                            };
                            (StatusCode::OK, Json(json!({ "data": response })))
                        }
                        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
                    }
                }
                Ok(false) => (StatusCode::UNAUTHORIZED, Json(json!({ "error": "Invalid credentials" }))),
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e }))),
            }
        }
        Err(_) => (StatusCode::UNAUTHORIZED, Json(json!({ "error": "Invalid credentials" }))),
    }
}

pub async fn get_users(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> (StatusCode, Json<Value>) {
    let (_, role) = match extract_auth(&headers) {
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
        "SELECT id, username, role, member_id, created_at FROM users ORDER BY id"
    ) {
        Ok(stmt) => stmt,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let users = stmt.query_map([], |row| {
        Ok(UserResponse {
            id: row.get(0)?,
            username: row.get(1)?,
            role: row.get(2)?,
            member_id: row.get(3)?,
            created_at: row.get(4)?,
        })
    });

    match users {
        Ok(rows) => {
            let result: Vec<UserResponse> = rows.filter_map(|r| r.ok()).collect();
            (StatusCode::OK, Json(json!({ "data": result })))
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

pub async fn get_current_user(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> (StatusCode, Json<Value>) {
    let (user_id, _) = match extract_auth(&headers) {
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
    pub user_id: i64,
    pub user_role: String,
}

pub async fn update_user(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateUserRequestWithAuth>,
) -> (StatusCode, Json<Value>) {
    if req.user_role != ROLE_ADMIN && req.user_id != id {
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
        if req.user_role != ROLE_ADMIN {
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
    let (_, role) = match extract_auth(&headers) {
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
