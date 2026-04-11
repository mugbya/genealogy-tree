use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use rusqlite::params;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};

use crate::models::{CreateMemberRelationRequest, MemberRelation};

pub async fn get_member_relations(
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let mut stmt = match conn.prepare(
        "SELECT mr.id, mr.from_member_id, mr.to_member_id, mr.relation_type, mr.tag_id, mr.created_at,
         fm.name as from_name, fm.gender as from_gender, tm.name as to_name, tm.gender as to_gender,
         rt.name as tag_name, rt.color as tag_color
         FROM member_relations mr
         LEFT JOIN family_members fm ON mr.from_member_id = fm.id
         LEFT JOIN family_members tm ON mr.to_member_id = tm.id
         LEFT JOIN relation_tags rt ON mr.tag_id = rt.id
         ORDER BY mr.from_member_id"
    ) {
        Ok(stmt) => stmt,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let relations = stmt.query_map([], |row| {
        Ok(MemberRelation {
            id: row.get(0)?,
            from_member_id: row.get(1)?,
            to_member_id: row.get(2)?,
            relation_type: row.get(3)?,
            tag_id: row.get(4)?,
            created_at: row.get(5)?,
            from_member_name: row.get(6)?,
            from_member_gender: row.get(7)?,
            to_member_name: row.get(8)?,
            to_member_gender: row.get(9)?,
            tag_name: row.get(10)?,
            tag_color: row.get(11)?,
        })
    });

    match relations {
        Ok(rows) => {
            let result: Vec<MemberRelation> = rows.filter_map(|r| r.ok()).collect();
            (StatusCode::OK, Json(json!({ "data": result })))
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

pub async fn get_member_relations_by_member(
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
    Path(member_id): Path<i64>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let mut stmt = match conn.prepare(
        "SELECT mr.id, mr.from_member_id, mr.to_member_id, mr.relation_type, mr.tag_id, mr.created_at,
         fm.name as from_name, fm.gender as from_gender, tm.name as to_name, tm.gender as to_gender,
         rt.name as tag_name, rt.color as tag_color
         FROM member_relations mr
         LEFT JOIN family_members fm ON mr.from_member_id = fm.id
         LEFT JOIN family_members tm ON mr.to_member_id = tm.id
         LEFT JOIN relation_tags rt ON mr.tag_id = rt.id
         WHERE mr.from_member_id = ? OR mr.to_member_id = ?
         ORDER BY mr.relation_type"
    ) {
        Ok(stmt) => stmt,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let relations = stmt.query_map(params![member_id, member_id], |row| {
        Ok(MemberRelation {
            id: row.get(0)?,
            from_member_id: row.get(1)?,
            to_member_id: row.get(2)?,
            relation_type: row.get(3)?,
            tag_id: row.get(4)?,
            created_at: row.get(5)?,
            from_member_name: row.get(6)?,
            from_member_gender: row.get(7)?,
            to_member_name: row.get(8)?,
            to_member_gender: row.get(9)?,
            tag_name: row.get(10)?,
            tag_color: row.get(11)?,
        })
    });

    match relations {
        Ok(rows) => {
            let result: Vec<MemberRelation> = rows.filter_map(|r| r.ok()).collect();
            (StatusCode::OK, Json(json!({ "data": result })))
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

pub async fn create_member_relation(
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
    Json(req): Json<CreateMemberRelationRequest>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let result = conn.execute(
        "INSERT INTO member_relations (from_member_id, to_member_id, relation_type, tag_id)
         VALUES (?1, ?2, ?3, ?4)",
        params![req.from_member_id, req.to_member_id, req.relation_type, req.tag_id],
    );

    match result {
        Ok(_) => {
            let id = conn.last_insert_rowid();
            (StatusCode::CREATED, Json(json!({ "data": { "id": id } })))
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

pub async fn delete_member_relation(
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
    Path(id): Path<i64>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let result = conn.execute("DELETE FROM member_relations WHERE id = ?", params![id]);

    match result {
        Ok(rows) if rows > 0 => (StatusCode::OK, Json(json!({ "success": true }))),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({ "error": "Relation not found" }))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}
