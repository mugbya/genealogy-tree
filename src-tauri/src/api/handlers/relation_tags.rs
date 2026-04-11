use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use rusqlite::params;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};

use crate::models::{CreateRelationTagRequest, RelationTag, UpdateRelationTagRequest};

pub async fn get_relation_tags(
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let mut stmt = match conn.prepare(
        "SELECT id, name, tag_type, color, created_at FROM relation_tags ORDER BY tag_type, name"
    ) {
        Ok(stmt) => stmt,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let tags = stmt.query_map([], |row| {
        Ok(RelationTag {
            id: row.get(0)?,
            name: row.get(1)?,
            tag_type: row.get(2)?,
            color: row.get(3)?,
            created_at: row.get(4)?,
        })
    });

    match tags {
        Ok(rows) => {
            let result: Vec<RelationTag> = rows.filter_map(|r| r.ok()).collect();
            (StatusCode::OK, Json(json!({ "data": result })))
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

pub async fn create_relation_tag(
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
    Json(req): Json<CreateRelationTagRequest>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let result = conn.execute(
        "INSERT INTO relation_tags (name, tag_type, color) VALUES (?1, ?2, ?3)",
        params![req.name, req.tag_type, req.color],
    );

    match result {
        Ok(_) => {
            let id = conn.last_insert_rowid();
            (StatusCode::CREATED, Json(json!({ "data": { "id": id } })))
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

pub async fn update_relation_tag(
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateRelationTagRequest>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let mut updates: Vec<&str> = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref name) = req.name {
        updates.push("name = ?1");
        values.push(Box::new(name.clone()));
    }
    if let Some(ref tag_type) = req.tag_type {
        updates.push("tag_type = ?2");
        values.push(Box::new(tag_type.clone()));
    }
    if let Some(ref color) = req.color {
        updates.push("color = ?3");
        values.push(Box::new(color.clone()));
    }

    if updates.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "No fields to update" })));
    }

    let sql = format!(
        "UPDATE relation_tags SET {} WHERE id = ?",
        updates.join(", ")
    );

    let result = conn.execute(&sql, rusqlite::params![id]);

    match result {
        Ok(rows) if rows > 0 => (StatusCode::OK, Json(json!({ "success": true }))),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({ "error": "Tag not found" }))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

pub async fn delete_relation_tag(
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
    Path(id): Path<i64>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let result = conn.execute("DELETE FROM relation_tags WHERE id = ?", params![id]);

    match result {
        Ok(rows) if rows > 0 => (StatusCode::OK, Json(json!({ "success": true }))),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({ "error": "Tag not found" }))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}
