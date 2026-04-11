use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use rusqlite::params;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};

use crate::models::{CreateMemberRequest, Member, UpdateMemberRequest};

pub async fn get_members(
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let mut stmt = match conn.prepare(
        "SELECT id, name, gender, generation, birth_date, death_date,
         birth_place, occupation, photo_path, biography, created_at, updated_at
         FROM family_members ORDER BY generation, name"
    ) {
        Ok(stmt) => stmt,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let members = stmt.query_map([], |row| {
        Ok(Member {
            id: row.get(0)?,
            name: row.get(1)?,
            gender: row.get(2)?,
            generation: row.get(3)?,
            birth_date: row.get(4)?,
            death_date: row.get(5)?,
            birth_place: row.get(6)?,
            occupation: row.get(7)?,
            photo_path: row.get(8)?,
            biography: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    });

    match members {
        Ok(rows) => {
            let result: Vec<Member> = rows.filter_map(|r| r.ok()).collect();
            (StatusCode::OK, Json(json!({ "data": result })))
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

pub async fn get_member(
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
    Path(id): Path<i64>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let result = conn.query_row(
        "SELECT id, name, gender, generation, birth_date, death_date,
         birth_place, occupation, photo_path, biography, created_at, updated_at
         FROM family_members WHERE id = ?",
        params![id],
        |row| {
            Ok(Member {
                id: row.get(0)?,
                name: row.get(1)?,
                gender: row.get(2)?,
                generation: row.get(3)?,
                birth_date: row.get(4)?,
                death_date: row.get(5)?,
                birth_place: row.get(6)?,
                occupation: row.get(7)?,
                photo_path: row.get(8)?,
                biography: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        },
    );

    match result {
        Ok(member) => (StatusCode::OK, Json(json!({ "data": member }))),
        Err(_) => (StatusCode::NOT_FOUND, Json(json!({ "error": "Member not found" }))),
    }
}

pub async fn create_member(
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
    Json(req): Json<CreateMemberRequest>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let result = conn.execute(
        "INSERT INTO family_members (name, gender, generation, birth_date, death_date,
         birth_place, occupation, photo_path, biography) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            req.name,
            req.gender,
            req.generation,
            req.birth_date,
            req.death_date,
            req.birth_place,
            req.occupation,
            req.photo_path,
            req.biography,
        ],
    );

    match result {
        Ok(_) => {
            let id = conn.last_insert_rowid();
            (StatusCode::CREATED, Json(json!({ "data": { "id": id } })))
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

pub async fn update_member(
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateMemberRequest>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let mut updates: Vec<&str> = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref name) = req.name {
        updates.push("name = ?");
        values.push(Box::new(name.clone()));
    }
    if let Some(ref gender) = req.gender {
        updates.push("gender = ?");
        values.push(Box::new(gender.clone()));
    }
    if let Some(ref generation) = req.generation {
        updates.push("generation = ?");
        values.push(Box::new(*generation));
    }
    if let Some(ref birth_date) = req.birth_date {
        updates.push("birth_date = ?");
        values.push(Box::new(birth_date.clone()));
    }
    if let Some(ref death_date) = req.death_date {
        updates.push("death_date = ?");
        values.push(Box::new(death_date.clone()));
    }
    if let Some(ref birth_place) = req.birth_place {
        updates.push("birth_place = ?");
        values.push(Box::new(birth_place.clone()));
    }
    if let Some(ref occupation) = req.occupation {
        updates.push("occupation = ?");
        values.push(Box::new(occupation.clone()));
    }
    if let Some(ref photo_path) = req.photo_path {
        updates.push("photo_path = ?");
        values.push(Box::new(photo_path.clone()));
    }
    if let Some(ref biography) = req.biography {
        updates.push("biography = ?");
        values.push(Box::new(biography.clone()));
    }

    if updates.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "No fields to update" })));
    }

    values.push(Box::new(id));
    let sql = format!(
        "UPDATE family_members SET {} WHERE id = ?",
        updates.join(", ")
    );

    let result = conn.execute(&sql, rusqlite::params_from_iter(values.iter()));

    match result {
        Ok(rows) if rows > 0 => (StatusCode::OK, Json(json!({ "success": true }))),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({ "error": "Member not found" }))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

pub async fn delete_member(
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
    Path(id): Path<i64>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let result = conn.execute("DELETE FROM family_members WHERE id = ?", params![id]);

    match result {
        Ok(rows) if rows > 0 => (StatusCode::OK, Json(json!({ "success": true }))),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({ "error": "Member not found" }))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}
