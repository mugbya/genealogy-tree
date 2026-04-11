use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use rusqlite::params;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};

use crate::models::{
    Config, CONFIG_ALLOW_CREATE_FAMILY, CONFIG_ALLOW_PUBLIC_ACCESS, CONFIG_FAMILY_NAME,
};

pub async fn get_all_configs(
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let mut stmt = match conn.prepare("SELECT id, key, value, updated_at FROM family_config ORDER BY key") {
        Ok(stmt) => stmt,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let configs = stmt.query_map([], |row| {
        Ok(Config {
            id: row.get(0)?,
            key: row.get(1)?,
            value: row.get(2)?,
            updated_at: row.get(3)?,
        })
    });

    match configs {
        Ok(rows) => {
            let result: Vec<Config> = rows.filter_map(|r| r.ok()).collect();
            (StatusCode::OK, Json(json!({ "data": result })))
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

pub async fn get_config(
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
    Path(key): Path<String>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let result = conn.query_row(
        "SELECT id, key, value, updated_at FROM family_config WHERE key = ?",
        params![key],
        |row| {
            Ok(Config {
                id: row.get(0)?,
                key: row.get(1)?,
                value: row.get(2)?,
                updated_at: row.get(3)?,
            })
        },
    );

    match result {
        Ok(config) => (StatusCode::OK, Json(json!({ "data": config }))),
        Err(_) => (StatusCode::NOT_FOUND, Json(json!({ "error": "Config not found" }))),
    }
}

pub async fn set_config(
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
    Json(req): Json<serde_json::Value>,
) -> (StatusCode, Json<Value>) {
    #[derive(serde::Deserialize)]
    struct SetConfigRequest {
        key: String,
        value: String,
    }

    let req: SetConfigRequest = match serde_json::from_value(req) {
        Ok(r) => r,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Invalid request body" }))),
    };

    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let result = conn.execute(
        "INSERT INTO family_config (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        params![req.key, req.value],
    );

    match result {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

pub async fn delete_config(
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
    Path(key): Path<String>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let result = conn.execute("DELETE FROM family_config WHERE key = ?", params![key]);

    match result {
        Ok(rows) if rows > 0 => (StatusCode::OK, Json(json!({ "success": true }))),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({ "error": "Config not found" }))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

pub async fn get_public_config(
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let get_value = |key: &str| -> String {
        conn.query_row(
            "SELECT value FROM family_config WHERE key = ?",
            params![key],
            |row| row.get(1),
        )
        .unwrap_or_else(|_| "false".to_string())
    };

    let config = serde_json::json!({
        "allow_create_family": get_value(CONFIG_ALLOW_CREATE_FAMILY) == "true",
        "allow_public_access": get_value(CONFIG_ALLOW_PUBLIC_ACCESS) == "true",
        "family_name": get_value(CONFIG_FAMILY_NAME),
    });

    (StatusCode::OK, Json(json!({ "data": config })))
}
