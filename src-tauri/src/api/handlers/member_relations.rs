use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use rusqlite::params;
use serde_json::{json, Value};

use crate::api::router::AppState;
use crate::auth::verify_token;
use crate::models::{CreateMemberRelationRequest, MemberRelation, ROLE_ADMIN};

/// 从请求头中提取用户认证信息
fn extract_user_info(headers: &HeaderMap) -> Result<(i64, String, Option<i64>), StatusCode> {
    let token = match headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
    {
        Some(s) => s.to_string(),
        None => return Err(StatusCode::UNAUTHORIZED),
    };

    let claims = match verify_token(&token) {
        Ok(c) => c,
        Err(_) => return Err(StatusCode::UNAUTHORIZED),
    };

    Ok((claims.sub, claims.role, None))
}

/// 检查用户是否有权限编辑指定成员
fn can_edit_member(
    conn: &rusqlite::Connection,
    user_role: &str,
    user_member_id: Option<i64>,
    target_member_id: i64,
) -> bool {
    // Admin can edit all
    if user_role == ROLE_ADMIN {
        return true;
    }

    // 没有关联成员ID的用户不能编辑任何成员
    let Some(my_member_id) = user_member_id else {
        return false;
    };

    // 不能编辑自己
    if my_member_id == target_member_id {
        return true;
    }

    // 检查是否在3代以内
    let ancestors = get_ancestors(conn, my_member_id, 3);
    let descendants = get_descendants(conn, my_member_id, 3);

    ancestors.contains(&target_member_id) || descendants.contains(&target_member_id)
}

/// 获取祖先成员IDs
fn get_ancestors(conn: &rusqlite::Connection, member_id: i64, generations: i32) -> Vec<i64> {
    let mut result = Vec::new();
    let mut current_ids = vec![member_id];
    let mut visited = std::collections::HashSet::new();
    visited.insert(member_id);

    for _ in 0..generations {
        let mut next_ids = Vec::new();
        for &mid in &current_ids {
            let father_id: Option<i64> = conn
                .query_row(
                    "SELECT to_member_id FROM member_relations WHERE from_member_id = ? AND relation_type = 'father'",
                    params![mid],
                    |row| row.get(0),
                )
                .ok();

            if let Some(fid) = father_id {
                if !visited.contains(&fid) {
                    visited.insert(fid);
                    next_ids.push(fid);
                    result.push(fid);
                }
            }

            let mother_id: Option<i64> = conn
                .query_row(
                    "SELECT to_member_id FROM member_relations WHERE from_member_id = ? AND relation_type = 'mother'",
                    params![mid],
                    |row| row.get(0),
                )
                .ok();

            if let Some(mid) = mother_id {
                if !visited.contains(&mid) {
                    visited.insert(mid);
                    next_ids.push(mid);
                    result.push(mid);
                }
            }
        }
        current_ids = next_ids;
    }

    result
}

/// 获取后代成员IDs
fn get_descendants(conn: &rusqlite::Connection, member_id: i64, generations: i32) -> Vec<i64> {
    let mut result = Vec::new();
    let mut current_ids = vec![member_id];
    let mut visited = std::collections::HashSet::new();
    visited.insert(member_id);

    for _ in 0..generations {
        let mut next_ids = Vec::new();
        for &mid in &current_ids {
            let children: Vec<i64> = conn
                .prepare("SELECT from_member_id FROM member_relations WHERE to_member_id = ? AND (relation_type = 'father' OR relation_type = 'mother')")
                .ok()
                .map(|mut stmt| {
                    stmt.query_map(params![mid], |row| row.get(0))
                        .ok()
                        .map(|rows| rows.filter_map(|r| r.ok()).collect())
                        .unwrap_or_default()
                })
                .unwrap_or_default();

            for child_id in children {
                if !visited.contains(&child_id) {
                    visited.insert(child_id);
                    next_ids.push(child_id);
                    result.push(child_id);
                }
            }
        }
        current_ids = next_ids;
    }

    result
}

pub async fn get_member_relations(
    State(state): State<AppState>,
) -> (StatusCode, Json<Value>) {
    let conn = match state.db.lock() {
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
    State(state): State<AppState>,
    Path(member_id): Path<i64>,
) -> (StatusCode, Json<Value>) {
    let conn = match state.db.lock() {
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
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<CreateMemberRelationRequest>,
) -> (StatusCode, Json<Value>) {
    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    // 权限检查
    let (user_id, user_role, _) = match extract_user_info(&headers) {
        Ok(info) => info,
        Err(status) => return (status, Json(json!({ "error": "Unauthorized" }))),
    };

    let user_member_id: Option<i64> = conn
        .query_row(
            "SELECT member_id FROM users WHERE id = ?",
            params![user_id],
            |row| row.get(0),
        )
        .ok();

    // 检查是否有权限编辑两个成员（至少有一个）
    let can_edit_from = can_edit_member(&conn, &user_role, user_member_id, req.from_member_id);
    let can_edit_to = can_edit_member(&conn, &user_role, user_member_id, req.to_member_id);

    if !can_edit_from && !can_edit_to {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "无权创建此关系" })));
    }

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
    State(state): State<AppState>,
    Path(id): Path<i64>,
    headers: HeaderMap,
) -> (StatusCode, Json<Value>) {
    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    // 权限检查
    let (user_id, user_role, _) = match extract_user_info(&headers) {
        Ok(info) => info,
        Err(status) => return (status, Json(json!({ "error": "Unauthorized" }))),
    };

    // 先获取关系信息，检查权限
    let relation = conn.query_row(
        "SELECT from_member_id, to_member_id FROM member_relations WHERE id = ?",
        params![id],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
    );

    let (from_member_id, to_member_id) = match relation {
        Ok(r) => r,
        Err(_) => return (StatusCode::NOT_FOUND, Json(json!({ "error": "Relation not found" }))),
    };

    let user_member_id: Option<i64> = conn
        .query_row(
            "SELECT member_id FROM users WHERE id = ?",
            params![user_id],
            |row| row.get(0),
        )
        .ok();

    // 检查是否有权限删除（能编辑任一成员即可）
    let can_edit_from = can_edit_member(&conn, &user_role, user_member_id, from_member_id);
    let can_edit_to = can_edit_member(&conn, &user_role, user_member_id, to_member_id);

    if !can_edit_from && !can_edit_to {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "无权删除此关系" })));
    }

    let result = conn.execute("DELETE FROM member_relations WHERE id = ?", params![id]);

    match result {
        Ok(rows) if rows > 0 => (StatusCode::OK, Json(json!({ "success": true }))),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({ "error": "Relation not found" }))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}
