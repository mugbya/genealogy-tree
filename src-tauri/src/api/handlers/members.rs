use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use calamine::{open_workbook, Reader, Xlsx};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::api::router::AppState;
use crate::auth::verify_token;
use crate::models::{CreateMemberRequest, Member, UpdateMemberRequest, ROLE_ADMIN};

/// 从请求头中提取用户认证信息，返回 (user_id, role, member_id)
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

/// 检查当前用户是否有权限编辑/删除指定成员
/// 普通用户只能编辑/删除自己及其直属上3代和下3代的成员
fn can_edit_member(
    conn: &rusqlite::Connection,
    _current_user_id: i64,
    current_user_role: &str,
    current_user_member_id: Option<i64>,
    target_member_id: i64,
) -> bool {
    eprintln!("[PERMISSION] can_edit_member called:");
    eprintln!("[PERMISSION]   current_user_role: {}", current_user_role);
    eprintln!("[PERMISSION]   current_user_member_id: {:?}", current_user_member_id);
    eprintln!("[PERMISSION]   target_member_id: {}", target_member_id);

    // Admin可以编辑所有成员
    if current_user_role == ROLE_ADMIN {
        eprintln!("[PERMISSION] Result: ALLOW (admin)");
        return true;
    }

    // 没有关联成员ID的用户不能编辑任何成员
    let Some(my_member_id) = current_user_member_id else {
        eprintln!("[PERMISSION] Result: DENY (no member_id)");
        return false;
    };

    // 不能编辑自己（这个应该在前端就限制）
    if my_member_id == target_member_id {
        eprintln!("[PERMISSION] Result: ALLOW (self)");
        return true;
    }

    // 检查是否在3代以内（包括祖先和后代）
    let ancestors = get_ancestors(conn, my_member_id, 3);
    let descendants = get_descendants(conn, my_member_id, 3);

    eprintln!("[PERMISSION]   my_member_id: {}", my_member_id);
    eprintln!("[PERMISSION]   ancestors (3 gens up): {:?}", ancestors);
    eprintln!("[PERMISSION]   descendants (3 gens down): {:?}", descendants);
    eprintln!("[PERMISSION]   target in ancestors: {}", ancestors.contains(&target_member_id));
    eprintln!("[PERMISSION]   target in descendants: {}", descendants.contains(&target_member_id));

    let result = ancestors.contains(&target_member_id) || descendants.contains(&target_member_id);
    eprintln!("[PERMISSION] Result: {}", if result { "ALLOW" } else { "DENY" });
    result
}

/// 获取祖先成员IDs（向上追溯n代）
fn get_ancestors(conn: &rusqlite::Connection, member_id: i64, generations: i32) -> Vec<i64> {
    let mut result = Vec::new();
    let mut current_ids = vec![member_id];
    let mut visited = std::collections::HashSet::new();
    visited.insert(member_id);

    for _ in 0..generations {
        let mut next_ids = Vec::new();
        for &mid in &current_ids {
            // 查找当前成员的父亲
            let father_id: Option<i64> = conn
                .query_row(
                    "SELECT to_member_id FROM member_relations
                     WHERE from_member_id = ? AND relation_type = 'father'",
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

            // 查找当前成员的母亲
            let mother_id: Option<i64> = conn
                .query_row(
                    "SELECT to_member_id FROM member_relations
                     WHERE from_member_id = ? AND relation_type = 'mother'",
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

/// 获取后代成员IDs（向下追溯n代）
/// 注意：member_relations 表中 from_member_id=孩子, to_member_id=父母
/// 要找后代，就是找以当前成员为父母的人，即 to_member_id = 当前成员
fn get_descendants(conn: &rusqlite::Connection, member_id: i64, generations: i32) -> Vec<i64> {
    let mut result = Vec::new();
    let mut current_ids = vec![member_id];
    let mut visited = std::collections::HashSet::new();
    visited.insert(member_id);

    for _ in 0..generations {
        let mut next_ids = Vec::new();
        for &mid in &current_ids {
            // 查找以当前成员为父亲的子成员 (from_member_id = 孩子, to_member_id = 父亲)
            // 要找孩子，就是找 to_member_id = mid AND relation_type = 'father' 的记录
            let sons: Vec<i64> = conn
                .prepare(
                    "SELECT from_member_id FROM member_relations
                     WHERE to_member_id = ? AND relation_type = 'father'",
                )
                .ok()
                .map(|mut stmt| {
                    stmt.query_map(params![mid], |row| row.get(0))
                        .ok()
                        .map(|rows| rows.filter_map(|r| r.ok()).collect())
                        .unwrap_or_default()
                })
                .unwrap_or_default();

            for son_id in sons {
                if !visited.contains(&son_id) {
                    visited.insert(son_id);
                    next_ids.push(son_id);
                    result.push(son_id);
                }
            }

            // 查找以当前成员为母亲的子成员
            let daughters: Vec<i64> = conn
                .prepare(
                    "SELECT from_member_id FROM member_relations
                     WHERE to_member_id = ? AND relation_type = 'mother'",
                )
                .ok()
                .map(|mut stmt| {
                    stmt.query_map(params![mid], |row| row.get(0))
                        .ok()
                        .map(|rows| rows.filter_map(|r| r.ok()).collect())
                        .unwrap_or_default()
                })
                .unwrap_or_default();

            for daughter_id in daughters {
                if !visited.contains(&daughter_id) {
                    visited.insert(daughter_id);
                    next_ids.push(daughter_id);
                    result.push(daughter_id);
                }
            }
        }
        current_ids = next_ids;
    }

    result
}

#[derive(Debug, Deserialize)]
pub struct ImportMemberRow {
    pub 姓名: String,
    pub 姓氏: Option<String>,
    pub 性别: String,
    #[serde(default)]
    pub 出生日期: Option<String>,
    #[serde(default)]
    pub 逝世日期: Option<String>,
    #[serde(default)]
    pub 是否离世: Option<String>,
    #[serde(default)]
    pub 籍贯: Option<String>,
    #[serde(default)]
    pub 职业: Option<String>,
    #[serde(default)]
    pub 父亲: Option<String>,
    #[serde(default)]
    pub 母亲: Option<String>,
    #[serde(default)]
    pub 配偶: Option<String>,
    #[serde(default)]
    pub 是否入赘: Option<String>,
    #[serde(default)]
    pub 是否招夫养子: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub imported: usize,
    pub updated: usize,
    pub errors: Vec<String>,
}

pub async fn import_members(
    State(state): State<AppState>,
    Json(data): Json<ImportData>,
) -> (StatusCode, Json<Value>) {
    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    // Decode base64 to bytes
    let bytes = match STANDARD.decode(&data.file_content) {
        Ok(b) => b,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Failed to decode file: {}", e) }))),
    };

    // Parse Excel
    let rows = match parse_excel(&bytes) {
        Ok(r) => r,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Failed to parse Excel: {}", e) }))),
    };

    if rows.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "No data found in Excel file" })));
    }

    let mut imported = 0;
    let mut updated = 0;
    let mut errors: Vec<String> = Vec::new();
    let mut name_to_id: HashMap<String, i64> = HashMap::new();

    // Stage 1: Insert/update all members (without relations)
    for row in &rows {
        let name = row.姓名.trim();
        if name.is_empty() {
            continue;
        }

        // Convert gender: 男→male, 女→female
        let gender = match row.性别.as_str() {
            "男" => "male",
            "女" => "female",
            _ => "male",
        };

        // Convert is_deceased: 是→true, 否→false
        let is_deceased = match row.是否离世.as_deref() {
            Some("是") => true,
            Some("否") => false,
            _ => false,
        };

        // Convert is_matrilocal: 是→true, 否→false
        let is_matrilocal = match row.是否入赘.as_deref() {
            Some("是") => true,
            Some("否") => false,
            _ => false,
        };

        // Convert is_adopted_son: 是→true, 否→false
        let is_adopted_son = match row.是否招夫养子.as_deref() {
            Some("是") => true,
            Some("否") => false,
            _ => false,
        };

        // Check if member exists by name
        let existing_id: Option<i64> = conn
            .query_row("SELECT id FROM family_members WHERE name = ?", params![name], |row| row.get(0))
            .ok();

        if let Some(id) = existing_id {
            // Update existing
            let result = conn.execute(
                "UPDATE family_members SET surname = ?, gender = ?, birth_date = ?, death_date = ?, is_deceased = ?,
                 birth_place = ?, occupation = ?, is_matrilocal = ?, is_adopted_son = ? WHERE id = ?",
                params![row.姓氏, gender, row.出生日期, row.逝世日期, is_deceased, row.籍贯, row.职业, is_matrilocal, is_adopted_son, id],
            );
            match result {
                Ok(_) => updated += 1,
                Err(e) => errors.push(format!("Failed to update {}: {}", name, e)),
            }
        } else {
            // Insert new
            let result = conn.execute(
                "INSERT INTO family_members (name, surname, gender, birth_date, death_date, is_deceased,
                 birth_place, occupation, is_matrilocal, is_adopted_son) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![name, row.姓氏, gender, row.出生日期, row.逝世日期, is_deceased, row.籍贯, row.职业, is_matrilocal, is_adopted_son],
            );
            match result {
                Ok(_) => {
                    imported += 1;
                    let new_id = conn.last_insert_rowid();
                    name_to_id.insert(name.to_string(), new_id);
                }
                Err(e) => errors.push(format!("Failed to insert {}: {}", name, e)),
            }
        }
    }

    // Get all member IDs (from both existing and newly inserted)
    let mut stmt = match conn.prepare("SELECT id, name FROM family_members") {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };
    let all_members: Vec<(i64, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    for (id, name) in all_members {
        name_to_id.insert(name, id);
    }

    // Stage 2: Create relations based on father/mother/spouse
    for row in &rows {
        let name = row.姓名.trim();
        if name.is_empty() {
            continue;
        }

        let Some(&member_id) = name_to_id.get(name) else {
            continue;
        };

        // Father relation
        if let Some(ref father_name) = row.父亲 {
            let father_name = father_name.trim();
            if !father_name.is_empty() {
                if let Some(&father_id) = name_to_id.get(father_name) {
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO member_relations (from_member_id, to_member_id, relation_type) VALUES (?, ?, ?)",
                        params![member_id, father_id, "father"],
                    );
                }
            }
        }

        // Mother relation
        if let Some(ref mother_name) = row.母亲 {
            let mother_name = mother_name.trim();
            if !mother_name.is_empty() {
                if let Some(&mother_id) = name_to_id.get(mother_name) {
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO member_relations (from_member_id, to_member_id, relation_type) VALUES (?, ?, ?)",
                        params![member_id, mother_id, "mother"],
                    );
                }
            }
        }

        // Spouse relation (comma-separated)
        if let Some(ref spouse_str) = row.配偶 {
            for spouse_name in spouse_str.split(',') {
                let spouse_name = spouse_name.trim();
                if !spouse_name.is_empty() {
                    if let Some(&spouse_id) = name_to_id.get(spouse_name) {
                        let _ = conn.execute(
                            "INSERT OR IGNORE INTO member_relations (from_member_id, to_member_id, relation_type) VALUES (?, ?, ?)",
                            params![member_id, spouse_id, "spouse"],
                        );
                    }
                }
            }
        }
    }

    let result = ImportResult {
        imported,
        updated,
        errors,
    };

    (StatusCode::OK, Json(json!({ "data": result })))
}

#[derive(Debug, Deserialize)]
pub struct ImportData {
    pub file_content: String,
}

fn parse_excel(bytes: &[u8]) -> Result<Vec<ImportMemberRow>, String> {
    // Write to temporary file since calamine requires a path
    let mut temp_file = std::env::temp_dir();
    temp_file.push("genealogy_import.xlsx");
    std::fs::write(&temp_file, bytes)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    let mut workbook: Xlsx<_> = open_workbook(&temp_file)
        .map_err(|e| format!("Failed to open workbook: {}", e))?;

    let sheet_name = workbook.sheet_names()
        .first()
        .ok_or("No sheet found")?
        .to_string();

    let range = workbook.worksheet_range(&sheet_name)
        .map_err(|e| format!("Failed to read sheet: {}", e))?;

    let mut rows: Vec<ImportMemberRow> = Vec::new();

    // Parse header row
    let headers: Vec<String> = range.rows()
        .next()
        .map(|row| row.iter().map(|c| c.to_string()).collect())
        .unwrap_or_default();

    // Parse data rows
    for row in range.rows().skip(1) {
        if row.iter().all(|c| c.to_string().trim().is_empty()) {
            continue;
        }

        let mut map: HashMap<String, String> = HashMap::new();
        for (i, cell) in row.iter().enumerate() {
            if let Some(header) = headers.get(i) {
                map.insert(header.clone(), cell.to_string());
            }
        }

        let member = ImportMemberRow {
            姓名: map.get("姓名").cloned().unwrap_or_default(),
            姓氏: map.get("姓氏").and_then(|s| if s.is_empty() { None } else { Some(s.clone()) }),
            性别: map.get("性别").cloned().unwrap_or_default(),
            出生日期: map.get("出生日期").and_then(|s| if s.is_empty() { None } else { Some(s.clone()) }),
            逝世日期: map.get("逝世日期").and_then(|s| if s.is_empty() { None } else { Some(s.clone()) }),
            是否离世: map.get("是否离世").and_then(|s| if s.is_empty() { None } else { Some(s.clone()) }),
            籍贯: map.get("籍贯").and_then(|s| if s.is_empty() { None } else { Some(s.clone()) }),
            职业: map.get("职业").and_then(|s| if s.is_empty() { None } else { Some(s.clone()) }),
            父亲: map.get("父亲").and_then(|s| if s.is_empty() { None } else { Some(s.clone()) }),
            母亲: map.get("母亲").and_then(|s| if s.is_empty() { None } else { Some(s.clone()) }),
            配偶: map.get("配偶").and_then(|s| if s.is_empty() { None } else { Some(s.clone()) }),
            是否入赘: map.get("是否入赘").and_then(|s| if s.is_empty() { None } else { Some(s.clone()) }),
            是否招夫养子: map.get("是否招夫养子").and_then(|s| if s.is_empty() { None } else { Some(s.clone()) }),
        };

        rows.push(member);
    }

    Ok(rows)
}

pub async fn get_members(
    State(state): State<AppState>,
) -> (StatusCode, Json<Value>) {
    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let mut stmt = match conn.prepare(
        "SELECT id, name, surname, gender, generation, weight, birth_date, death_date, is_deceased,
         birth_place, occupation, photo_path, biography, is_matrilocal, is_adopted_son, created_at, updated_at
         FROM family_members ORDER BY weight DESC, generation, name"
    ) {
        Ok(stmt) => stmt,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let members = stmt.query_map([], |row| {
        Ok(Member {
            id: row.get(0)?,
            name: row.get(1)?,
            surname: row.get(2)?,
            gender: row.get(3)?,
            generation: row.get(4)?,
            weight: row.get(5)?,
            birth_date: row.get(6)?,
            death_date: row.get(7)?,
            is_deceased: row.get::<_, i32>(8)? != 0,
            birth_place: row.get(9)?,
            occupation: row.get(10)?,
            photo_path: row.get(11)?,
            biography: row.get(12)?,
            is_matrilocal: row.get::<_, i32>(13)? != 0,
            is_adopted_son: row.get::<_, i32>(14)? != 0,
            created_at: row.get(15)?,
            updated_at: row.get(16)?,
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
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> (StatusCode, Json<Value>) {
    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let result = conn.query_row(
        "SELECT id, name, surname, gender, generation, weight, birth_date, death_date, is_deceased,
         birth_place, occupation, photo_path, biography, is_matrilocal, is_adopted_son, created_at, updated_at
         FROM family_members WHERE id = ?",
        params![id],
        |row| {
            Ok(Member {
                id: row.get(0)?,
                name: row.get(1)?,
                surname: row.get(2)?,
                gender: row.get(3)?,
                generation: row.get(4)?,
                weight: row.get(5)?,
                birth_date: row.get(6)?,
                death_date: row.get(7)?,
                is_deceased: row.get::<_, i32>(8)? != 0,
                birth_place: row.get(9)?,
                occupation: row.get(10)?,
                photo_path: row.get(11)?,
                biography: row.get(12)?,
                is_matrilocal: row.get::<_, i32>(13)? != 0,
                is_adopted_son: row.get::<_, i32>(14)? != 0,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
            })
        },
    );

    match result {
        Ok(member) => (StatusCode::OK, Json(json!({ "data": member }))),
        Err(_) => (StatusCode::NOT_FOUND, Json(json!({ "error": "Member not found" }))),
    }
}

pub async fn create_member(
    State(state): State<AppState>,
    Json(req): Json<CreateMemberRequest>,
) -> (StatusCode, Json<Value>) {
    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let result = conn.execute(
        "INSERT INTO family_members (name, surname, gender, generation, weight, birth_date, death_date, is_deceased,
         birth_place, occupation, photo_path, biography, is_matrilocal, is_adopted_son) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            req.name,
            req.surname,
            req.gender,
            req.generation,
            req.weight.unwrap_or(0),
            req.birth_date,
            req.death_date,
            req.is_deceased.unwrap_or(false),
            req.birth_place,
            req.occupation,
            req.photo_path,
            req.biography,
            req.is_matrilocal.unwrap_or(false),
            req.is_adopted_son.unwrap_or(false),
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
    State(state): State<AppState>,
    Path(id): Path<i64>,
    headers: HeaderMap,
    Json(req): Json<UpdateMemberRequest>,
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

    eprintln!("[UPDATE_MEMBER] user_id: {}, user_role: {}", user_id, user_role);

    // 获取用户关联的成员ID
    let user_member_id: Option<i64> = conn
        .query_row(
            "SELECT member_id FROM users WHERE id = ?",
            params![user_id],
            |row| row.get(0),
        )
        .ok();

    eprintln!("[UPDATE_MEMBER] target_id: {}, user_member_id: {:?}", id, user_member_id);

    // 检查权限
    if !can_edit_member(&conn, user_id, &user_role, user_member_id, id) {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "无权编辑此成员信息" })));
    }

    let mut updates: Vec<&str> = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(ref name) = req.name {
        updates.push("name = ?");
        values.push(Box::new(name.clone()));
    }
    if let Some(ref surname) = req.surname {
        updates.push("surname = ?");
        values.push(Box::new(surname.clone()));
    }
    if let Some(ref gender) = req.gender {
        updates.push("gender = ?");
        values.push(Box::new(gender.clone()));
    }
    if let Some(ref generation) = req.generation {
        updates.push("generation = ?");
        values.push(Box::new(generation.clone()));
    }
    if let Some(ref weight) = req.weight {
        updates.push("weight = ?");
        values.push(Box::new(*weight));
    }
    if let Some(ref birth_date) = req.birth_date {
        updates.push("birth_date = ?");
        values.push(Box::new(birth_date.clone()));
    }
    if let Some(ref death_date) = req.death_date {
        updates.push("death_date = ?");
        values.push(Box::new(death_date.clone()));
    }
    if let Some(ref is_deceased) = req.is_deceased {
        updates.push("is_deceased = ?");
        values.push(Box::new(*is_deceased as i32));
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
    if let Some(ref is_matrilocal) = req.is_matrilocal {
        updates.push("is_matrilocal = ?");
        values.push(Box::new(*is_matrilocal as i32));
    }
    if let Some(ref is_adopted_son) = req.is_adopted_son {
        updates.push("is_adopted_son = ?");
        values.push(Box::new(*is_adopted_son as i32));
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

    eprintln!("[UPDATE_MEMBER] user_id: {}, user_role: {}", user_id, user_role);

    // 获取用户关联的成员ID
    let user_member_id: Option<i64> = conn
        .query_row(
            "SELECT member_id FROM users WHERE id = ?",
            params![user_id],
            |row| row.get(0),
        )
        .ok();

    eprintln!("[UPDATE_MEMBER] target_id: {}, user_member_id: {:?}", id, user_member_id);

    // 检查权限
    if !can_edit_member(&conn, user_id, &user_role, user_member_id, id) {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "无权删除此成员" })));
    }

    let result = conn.execute("DELETE FROM family_members WHERE id = ?", params![id]);

    match result {
        Ok(rows) if rows > 0 => (StatusCode::OK, Json(json!({ "success": true }))),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({ "error": "Member not found" }))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

/// 获取当前用户可编辑的成员ID列表
/// 用于前端界面权限控制
pub async fn get_editable_member_ids(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> (StatusCode, Json<Value>) {
    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    // 提取用户信息
    let (user_id, user_role, _) = match extract_user_info(&headers) {
        Ok(info) => info,
        Err(status) => return (status, Json(json!({ "error": "Unauthorized" }))),
    };

    eprintln!("[EDITABLE_IDS] user_id: {}, role: {}", user_id, user_role);

    // Admin可以编辑所有成员
    if user_role == ROLE_ADMIN {
        let mut stmt = match conn.prepare("SELECT id FROM family_members") {
            Ok(s) => s,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
        };
        let ids: Vec<i64> = stmt.query_map([], |row| row.get(0)).ok()
            .map(|rows| rows.filter_map(|r| r.ok()).collect())
            .unwrap_or_default();
        return (StatusCode::OK, Json(json!({ "data": ids })));
    }

    // 获取用户关联的成员ID
    let user_member_id: Option<i64> = conn
        .query_row(
            "SELECT member_id FROM users WHERE id = ?",
            params![user_id],
            |row| row.get(0),
        )
        .ok();

    eprintln!("[EDITABLE_IDS] user_member_id: {:?}", user_member_id);

    // 没有关联成员ID的用户不能编辑任何成员
    let Some(my_member_id) = user_member_id else {
        return (StatusCode::OK, Json(json!({ "data": Vec::<i64>::new() })));
    };

    // 可编辑的成员：自己 + 祖先(3代) + 后代(3代)
    let mut editable_ids = vec![my_member_id];

    let ancestors = get_ancestors(&conn, my_member_id, 3);
    let descendants = get_descendants(&conn, my_member_id, 3);

    editable_ids.extend(ancestors);
    editable_ids.extend(descendants);

    eprintln!("[EDITABLE_IDS] editable_ids: {:?}", editable_ids);

    (StatusCode::OK, Json(json!({ "data": editable_ids })))
}
