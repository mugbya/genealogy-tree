use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use calamine::{open_workbook, Reader, Xlsx};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::models::{CreateMemberRequest, Member, UpdateMemberRequest};

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
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
    Json(data): Json<ImportData>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
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
    State(db): State<Arc<Mutex<rusqlite::Connection>>>,
) -> (StatusCode, Json<Value>) {
    let conn = match db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let mut stmt = match conn.prepare(
        "SELECT id, name, surname, gender, generation, birth_date, death_date, is_deceased,
         birth_place, occupation, photo_path, biography, is_matrilocal, is_adopted_son, created_at, updated_at
         FROM family_members ORDER BY generation, name"
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
            birth_date: row.get(5)?,
            death_date: row.get(6)?,
            is_deceased: row.get::<_, i32>(7)? != 0,
            birth_place: row.get(8)?,
            occupation: row.get(9)?,
            photo_path: row.get(10)?,
            biography: row.get(11)?,
            is_matrilocal: row.get::<_, i32>(12)? != 0,
            is_adopted_son: row.get::<_, i32>(13)? != 0,
            created_at: row.get(14)?,
            updated_at: row.get(15)?,
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
        "SELECT id, name, surname, gender, generation, birth_date, death_date, is_deceased,
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
                birth_date: row.get(5)?,
                death_date: row.get(6)?,
                is_deceased: row.get::<_, i32>(7)? != 0,
                birth_place: row.get(8)?,
                occupation: row.get(9)?,
                photo_path: row.get(10)?,
                biography: row.get(11)?,
                is_matrilocal: row.get::<_, i32>(12)? != 0,
                is_adopted_son: row.get::<_, i32>(13)? != 0,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
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
        "INSERT INTO family_members (name, surname, gender, generation, birth_date, death_date, is_deceased,
         birth_place, occupation, photo_path, biography, is_matrilocal, is_adopted_son) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            req.name,
            req.surname,
            req.gender,
            req.generation,
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
