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
use tracing::{warn, debug, error};

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
/// - Admin: 可以编辑所有成员
/// - 普通用户(未绑定成员): 不能编辑任何成员
/// - 普通用户(已绑定成员): 只能编辑自己绑定的那个成员
fn can_edit_member(
    _conn: &rusqlite::Connection,
    _current_user_id: i64,
    current_user_role: &str,
    current_user_member_id: Option<i64>,
    target_member_id: i64,
) -> bool {
    debug!(module="members", "[PERMISSION] can_edit_member called:");
    debug!(module="members", "  current_user_role: {}", current_user_role);
    debug!(module="members", "  current_user_member_id: {:?}", current_user_member_id);
    debug!(module="members", "  target_member_id: {}", target_member_id);
    debug!(module="members", "Result: ALLOW (admin)");

    // Admin可以编辑所有成员
    if current_user_role == ROLE_ADMIN {
        debug!(module="members", "Result: ALLOW (admin)");
        return true;
    }

    // 没有关联成员ID的用户不能编辑任何成员
    let Some(my_member_id) = current_user_member_id else {
        debug!(module="members", "Result: DENY (no member_id bound)");
        return false;
    };

    // 只能编辑自己绑定的成员
    let result = my_member_id == target_member_id;
    debug!(module="members", "Result: {}", if result { "ALLOW (self)" } else { "DENY" });
    result
}

/// 获取祖先成员IDs（向上追溯n代）
#[allow(dead_code)]
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
#[allow(dead_code)]
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

/// 根据父母关系重新计算所有成员的代数
/// 算法：
/// 1. 找出真正的第1代成员（没有父母且没有配偶的成员），标记为第1代
/// 2. 基于父母关系迭代计算其他成员的代数
/// 3. 对于没有代数但有配偶的成员，继承配偶的代数
pub fn recalculate_generations(conn: &rusqlite::Connection) -> Result<(), String> {
    // 获取所有成员ID
    let all_member_ids: Vec<i64> = conn
        .prepare("SELECT id FROM family_members")
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    if all_member_ids.is_empty() {
        return Ok(());
    }

    // 获取每个成员的代数
    let mut member_generation: HashMap<i64, i32> = HashMap::new();

    // 找出第1代成员：没有父母关系的成员（即不知道父母的成员）
    // 对于导入的数据，很多成员的父辈信息是未知的，应该把他们当作根节点（第一代）
    // 但入赘成员和招夫养子的代数由配偶决定，不在这里标记
    tracing::info!("[generation] Step 1: Marking generation 1 members (excluding matrilocal/adopted sons):");
    for &member_id in &all_member_ids {
        // 检查是否是入赘成员或招夫养子
        let (member_name, is_matrilocal, is_adopted_son) = conn
            .query_row(
                "SELECT name, is_matrilocal, is_adopted_son FROM family_members WHERE id = ?",
                params![member_id],
                |row| Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i32>(1)? != 0,
                    row.get::<_, i32>(2)? != 0,
                )),
            )
            .unwrap_or((String::new(), false, false));

        // 入赘成员或招夫养子的代数由配偶决定，不在这里标记为根节点
        if is_matrilocal || is_adopted_son {
            tracing::info!("[generation]   {} (matrilocal={}, adopted={}) - skipped (handled by spouse)",
                member_name, is_matrilocal, is_adopted_son);
            continue;
        }

        let has_father: bool = conn
            .query_row(
                "SELECT 1 FROM member_relations WHERE from_member_id = ? AND relation_type = 'father' LIMIT 1",
                params![member_id],
                |_| Ok(true),
            )
            .unwrap_or(false);

        let has_mother: bool = conn
            .query_row(
                "SELECT 1 FROM member_relations WHERE from_member_id = ? AND relation_type = 'mother' LIMIT 1",
                params![member_id],
                |_| Ok(true),
            )
            .unwrap_or(false);

        // 如果没有父亲或母亲，则是第1代（不知道自己的父辈，就当作根节点）
        // 这样可以正确处理导入数据中两兄弟都是第1代的情况
        if !has_father && !has_mother {
            member_generation.insert(member_id, 1);
            tracing::info!("[generation]   {} - marked as generation 1", member_name);
        } else {
            tracing::info!("[generation]   {} - skipped (has parent: father={}, mother={})",
                member_name, has_father, has_mother);
        }
    }

    // 合并 Step 2 和 Step 3，交替迭代直到没有进展
    // 每次迭代都重新计算所有成员的代数（取父母+1和配偶代数的最大值）
    // 这样当父亲的代数增加时，子女的代数也会自动增加
    tracing::info!("[generation] Step 2+3: Combined parent/spouse inheritance");
    for iteration in 0..all_member_ids.len() {
        tracing::info!("[generation] === Iteration {} ===", iteration);
        let mut made_progress = false;

        for &member_id in &all_member_ids {
            // 获取成员信息
            let (member_name, gender, is_matrilocal, is_adopted_son) = conn
                .query_row(
                    "SELECT name, gender, is_matrilocal, is_adopted_son FROM family_members WHERE id = ?",
                    params![member_id],
                    |row| Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i32>(2)? != 0,
                        row.get::<_, i32>(3)? != 0,
                    )),
                )
                .unwrap_or((String::new(), String::new(), false, false));

            let old_gen = member_generation.get(&member_id).copied();

            // 计算新的代数
            let mut new_gen: Option<i32> = None;

            // 入赘/招夫养子：只从配偶继承
            if is_matrilocal || is_adopted_son {
                // 获取所有配偶的代数
                let spouse_gens: Vec<i32> = conn
                    .query_row(
                        "SELECT mr.to_member_id FROM member_relations mr
                         WHERE mr.from_member_id = ? AND mr.relation_type = 'spouse'
                         UNION
                         SELECT mr.from_member_id FROM member_relations mr
                         WHERE mr.to_member_id = ? AND mr.relation_type = 'spouse'",
                        params![member_id, member_id],
                        |row| {
                            let spouse_id: i64 = row.get(0)?;
                            Ok(member_generation.get(&spouse_id).copied())
                        },
                    )
                    .ok()
                    .into_iter()
                    .flatten()
                    .collect();
                new_gen = spouse_gens.into_iter().max();
            } else {
                // 普通成员：尝试从父母计算，也考虑配偶
                // 获取父亲的代数（from_member_id = 子女, to_member_id = 父亲）
                let father_gen: Option<i32> = conn
                    .query_row(
                        "SELECT mr.to_member_id FROM member_relations mr
                         WHERE mr.from_member_id = ? AND mr.relation_type = 'father'",
                        params![member_id],
                        |row| {
                            let parent_id: i64 = row.get(0)?;
                            Ok(member_generation.get(&parent_id).copied())
                        },
                    )
                    .ok()
                    .flatten();

                // 获取母亲的代数
                let mother_gen: Option<i32> = conn
                    .query_row(
                        "SELECT mr.to_member_id FROM member_relations mr
                         WHERE mr.from_member_id = ? AND mr.relation_type = 'mother'",
                        params![member_id],
                        |row| {
                            let parent_id: i64 = row.get(0)?;
                            Ok(member_generation.get(&parent_id).copied())
                        },
                    )
                    .ok()
                    .flatten();

                // 父母代数 + 1
                let parent_based_gen = father_gen.or(mother_gen).map(|g| g + 1);

                // 获取所有配偶的代数
                let spouse_gens: Vec<i32> = conn
                    .query_row(
                        "SELECT mr.to_member_id FROM member_relations mr
                         WHERE mr.from_member_id = ? AND mr.relation_type = 'spouse'
                         UNION
                         SELECT mr.from_member_id FROM member_relations mr
                         WHERE mr.to_member_id = ? AND mr.relation_type = 'spouse'",
                        params![member_id, member_id],
                        |row| {
                            let spouse_id: i64 = row.get(0)?;
                            Ok(member_generation.get(&spouse_id).copied())
                        },
                    )
                    .ok()
                    .into_iter()
                    .flatten()
                    .collect();
                let spouse_based_gen = spouse_gens.into_iter().max();

                // 取父母和配偶的最大值
                new_gen = match (parent_based_gen, spouse_based_gen) {
                    (Some(p), Some(s)) => Some(p.max(s)),
                    (Some(p), None) => Some(p),
                    (None, Some(s)) => Some(s),
                    (None, None) => None,
                };
            }

            // 如果计算出的代数比当前更高，则更新
            if let Some(calc_gen) = new_gen {
                let should_update = match old_gen {
                    Some(old) if calc_gen > old => {
                        member_generation.insert(member_id, calc_gen);
                        tracing::info!("[generation] {} updated gen from {:?} to {}",
                            member_name, old_gen, calc_gen);
                        true
                    }
                    None => {
                        member_generation.insert(member_id, calc_gen);
                        tracing::info!("[generation] {} gen set to {}", member_name, calc_gen);
                        true
                    }
                    _ => false,
                };
                if should_update {
                    made_progress = true;
                }
            }
        }

        if !made_progress {
            break;
        }
    }

    // 打印最终结果
    tracing::info!("[generation] Final generation assignment:");
    for (member_id, gen) in &member_generation {
        let name = conn.query_row(
            "SELECT name FROM family_members WHERE id = ?",
            params![member_id],
            |row| row.get::<_, String>(0),
        ).unwrap_or_else(|_| "unknown".to_string());
        tracing::info!("  {} -> {}", name, gen);
    }

    // 更新数据库
    for (member_id, generation) in member_generation {
        conn.execute(
            "UPDATE family_members SET generation = ? WHERE id = ?",
            params![generation.to_string(), member_id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// 手动触发代数重算的API
pub async fn recalculate_all_generations(
    State(state): State<AppState>,
) -> (StatusCode, Json<Value>) {
    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    match recalculate_generations(&conn) {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true, "message": "代数已重新计算" }))),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    }
}

#[derive(Debug, Deserialize)]
pub struct ImportMemberRow {
    pub 姓名: String,
    pub 姓氏: Option<String>,
    pub 性别: String,
    #[serde(default)]
    pub 字辈: Option<String>,
    #[serde(default)]
    pub 排序: Option<i32>,
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
    #[serde(default)]
    pub 生平简介: Option<String>,
    #[serde(default)]
    pub 突出事迹: Option<String>,
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
    debug!(module="members", "[import] Starting import, file_content length: {}", data.file_content.len());
    let bytes = match STANDARD.decode(&data.file_content) {
        Ok(b) => b,
        Err(e) => {
            debug!(module="members", "[import] Failed to decode base64: {}", e);
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Failed to decode file: {}", e) })));
        }
    };
    debug!(module="members", "[import] Decoded {} bytes", bytes.len());

    // Check if it's CSV or Excel
    debug!(module="members", "[import] is_csv_content: {}", is_csv_content(&bytes));
    let rows = if is_csv_content(&bytes) {
        // Try to parse as CSV
        let content = match String::from_utf8(bytes.clone()) {
            Ok(c) => c,
            Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Failed to read file as text: {}", e) }))),
        };
        match parse_csv(&content) {
            Ok(r) => r,
            Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Failed to parse CSV: {}", e) }))),
        }
    } else {
        // Parse as Excel
        match parse_excel(&bytes) {
            Ok(r) => r,
            Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Failed to parse Excel: {}", e) }))),
        }
    };
    debug!(module="members", "[import] Parsed {} rows", rows.len());

    if rows.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "No data found in file" })));
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
            // 注意：generation 由系统根据父子关系自动计算，不允许导入时手动设置
            let weight_val = row.排序.unwrap_or(0);
            let result = conn.execute(
                "UPDATE family_members SET surname = ?, gender = ?, generation = NULL, generation_word = ?, weight = ?, birth_date = ?, death_date = ?, is_deceased = ?,
                 birth_place = ?, occupation = ?, biography = ?, remarkable_deeds = ?, is_matrilocal = ?, is_adopted_son = ? WHERE id = ?",
                params![row.姓氏, gender, row.字辈, weight_val, row.出生日期, row.逝世日期, is_deceased, row.籍贯, row.职业, row.生平简介, row.突出事迹, is_matrilocal, is_adopted_son, id],
            );
            match result {
                Ok(_) => updated += 1,
                Err(e) => errors.push(format!("Failed to update {}: {}", name, e)),
            }
        } else {
            // Insert new
            // 注意：generation 由系统根据父子关系自动计算，不允许导入时手动设置
            let weight_val = row.排序.unwrap_or(0);
            let result = conn.execute(
                "INSERT INTO family_members (name, surname, gender, generation, generation_word, weight, birth_date, death_date, is_deceased,
                 birth_place, occupation, biography, remarkable_deeds, is_matrilocal, is_adopted_son) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![name, row.姓氏, gender, row.字辈, weight_val, row.出生日期, row.逝世日期, is_deceased, row.籍贯, row.职业, row.生平简介, row.突出事迹, is_matrilocal, is_adopted_son],
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

        // Spouse relation (comma or Chinese comma separated)
        if let Some(ref spouse_str) = row.配偶 {
            // Split by ',', '，'(full-width comma), and '、'
            let spouses: Vec<&str> = spouse_str.split(|c| c == ',' || c == '，' || c == '、')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            tracing::info!("[import] Processing {} spouses for {}: {:?}", spouses.len(), name, spouses);
            for spouse_name in spouses {
                if let Some(&spouse_id) = name_to_id.get(spouse_name) {
                    let result = conn.execute(
                        "INSERT OR IGNORE INTO member_relations (from_member_id, to_member_id, relation_type) VALUES (?, ?, ?)",
                        params![member_id, spouse_id, "spouse"],
                    );
                    match result {
                        Ok(count) => tracing::info!("[import] Inserted spouse relation: {} -> {} (affected: {})", member_id, spouse_id, count),
                        Err(e) => tracing::error!("[import] Failed to insert spouse relation: {}", e),
                    }
                } else {
                    tracing::warn!("[import] Spouse not found in name_to_id: {}", spouse_name);
                }
            }
        }
    }

    // 重新计算所有成员的代数
    tracing::info!("[import] Starting recalculate_generations...");
    match recalculate_generations(&conn) {
        Ok(_) => {
            tracing::info!("[import] recalculate_generations completed successfully");
        },
        Err(e) => {
            tracing::error!("[import] Error in recalculate_generations: {}", e);
        }
    }

    let result = ImportResult {
        imported,
        updated,
        errors,
    };

    (StatusCode::OK, Json(json!({ "data": result })))
}

// 清空所有家族成员数据并重新导入
pub async fn clear_and_import_members(
    State(state): State<AppState>,
    Json(data): Json<ImportData>,
) -> (StatusCode, Json<Value>) {
    let mut conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    tracing::error!(module="members", "[clear_and_import] Starting clear and import...");

    // 开始事务
    let tx = match conn.unchecked_transaction() {
        Ok(tx) => tx,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("事务开启失败: {}", e) }))),
    };

    // 1. 删除所有现有成员关系
    if let Err(e) = tx.execute("DELETE FROM member_relations", []) {
        tracing::error!(module="members", "[clear_and_import] Failed to clear member_relations: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("清空关系失败: {}", e) })));
    }
    tracing::error!(module="members", "[clear_and_import] Cleared all member_relations");

    // 2. 删除所有现有成员 (表名是 family_members)
    if let Err(e) = tx.execute("DELETE FROM family_members", []) {
        tracing::error!(module="members", "[clear_and_import] Failed to clear family_members: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("清空成员失败: {}", e) })));
    }
    tracing::error!(module="members", "[clear_and_import] Cleared all family_members");

    // 3. 重新生成自增ID起始值（从1开始）
    if let Err(e) = tx.execute("DELETE FROM sqlite_sequence WHERE name='family_members' OR name='member_relations'", []) {
        tracing::error!(module="members", "[clear_and_import] Failed to reset sequence: {}", e);
        // 不影响流程，继续
    }

    if let Err(e) = tx.commit() {
        tracing::error!(module="members", "[clear_and_import] Failed to commit clear transaction: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("提交失败: {}", e) })));
    }

    tracing::error!(module="members", "[clear_and_import] Clear completed, now importing...");

    // 复用 import_members 的逻辑，但使用新的 data
    // 由于 import_members 已经处理了文件解析，我们直接调用其内部逻辑
    // 但因为我们需要释放锁并重新获取，这里手动实现导入逻辑

    let bytes = match STANDARD.decode(&data.file_content) {
        Ok(b) => b,
        Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Failed to decode file: {}", e) }))),
    };

    let rows = if is_csv_content(&bytes) {
        let content = match String::from_utf8(bytes.clone()) {
            Ok(c) => c,
            Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Failed to read file as text: {}", e) }))),
        };
        match parse_csv(&content) {
            Ok(r) => r,
            Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Failed to parse CSV: {}", e) }))),
        }
    } else {
        match parse_excel(&bytes) {
            Ok(r) => r,
            Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": format!("Failed to parse Excel: {}", e) }))),
        }
    };

    if rows.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "No data found in file" })));
    }

    let mut imported = 0;
    let mut updated = 0;
    let mut errors: Vec<String> = Vec::new();
    let mut name_to_id: HashMap<String, i64> = HashMap::new();

    // Stage 1: Insert all members (all are new after clear)
    for row in &rows {
        let name = row.姓名.trim();
        if name.is_empty() {
            continue;
        }

        let gender = match row.性别.as_str() {
            "男" => "male",
            "女" => "female",
            _ => "male",
        };

        let is_deceased = match row.是否离世.as_deref() {
            Some("是") => true,
            Some("否") => false,
            _ => false,
        };

        let is_matrilocal = match row.是否入赘.as_deref() {
            Some("是") => true,
            Some("否") => false,
            _ => false,
        };

        let is_adopted_son = match row.是否招夫养子.as_deref() {
            Some("是") => true,
            Some("否") => false,
            _ => false,
        };

        let weight_val = row.排序.unwrap_or(0);
        let result = conn.execute(
            "INSERT INTO family_members (name, surname, gender, generation, generation_word, weight, birth_date, death_date, is_deceased,
             birth_place, occupation, biography, remarkable_deeds, is_matrilocal, is_adopted_son) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![name, row.姓氏, gender, row.字辈, weight_val, row.出生日期, row.逝世日期, is_deceased, row.籍贯, row.职业, row.生平简介, row.突出事迹, is_matrilocal, is_adopted_son],
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

    // Get all member IDs
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

    // Stage 2: Create relations
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

        // Spouse relation
        if let Some(ref spouse_str) = row.配偶 {
            let spouses: Vec<&str> = spouse_str.split(|c| c == ',' || c == '，' || c == '、')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            for spouse_name in spouses {
                if let Some(&spouse_id) = name_to_id.get(spouse_name) {
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO member_relations (from_member_id, to_member_id, relation_type) VALUES (?, ?, ?)",
                        params![member_id, spouse_id, "spouse"],
                    );
                }
            }
        }
    }

    // 重新计算所有成员的代数
    if let Err(e) = recalculate_generations(&conn) {
        tracing::error!(module="members", "[clear_and_import] recalculate_generations error: {}", e);
    }

    tracing::error!(module="members", "[clear_and_import] Completed: imported={}, updated={}", imported, updated);

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

        let member = parse_row_from_map(&map);
        rows.push(member);
    }

    Ok(rows)
}

fn trim_bom(s: &str) -> &str {
    s.strip_prefix('\u{feff}').unwrap_or(s)
}

fn parse_csv(content: &str) -> Result<Vec<ImportMemberRow>, String> {
    debug!(module="members", "[import] parse_csv called, content length: {}", content.len());
    debug!(module="members", "[import] First 200 chars: {:?}", &content.chars().take(200).collect::<String>());
    let mut rows: Vec<ImportMemberRow> = Vec::new();
    let mut lines = content.lines();

    // Parse header row
    let headers: Vec<String> = lines.next()
        .map(|line| {
            parse_csv_line(line).into_iter()
                .map(|s| trim_bom(&s).to_string())
                .collect()
        })
        .unwrap_or_default();
    debug!(module="members", "[import] CSV headers: {:?}", headers);

    // Parse data rows
    for line in lines {
        let values = parse_csv_line(line);
        if values.is_empty() || values.iter().all(|s| s.trim().is_empty()) {
            continue;
        }

        let mut map: HashMap<String, String> = HashMap::new();
        for (i, value) in values.iter().enumerate() {
            if let Some(header) = headers.get(i) {
                map.insert(header.clone(), value.clone());
            }
        }

        let member = parse_row_from_map(&map);
        debug!(module="members", "[import] Row {}: name='{}', gender='{}', surname='{:?}'", rows.len(), member.姓名, member.性别, member.姓氏);
        // Debug: check if name is empty
        if member.姓名.trim().is_empty() {
            warn!(module="members", "[import] WARNING: name is empty! map keys: {:?}", map.keys().collect::<Vec<_>>());
            debug!(module="members", "[import] map content: {:?}", map);
        }
        rows.push(member);
    }

    debug!(module="members", "[import] Total CSV rows parsed: {}", rows.len());
    Ok(rows)
}

fn parse_csv_line(line: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut in_quotes = false;
    let mut current = String::new();

    for ch in line.chars() {
        match ch {
            '"' => {
                in_quotes = !in_quotes;
            }
            ',' if !in_quotes => {
                result.push(current.trim().to_string());
                current = String::new();
            }
            _ => {
                current.push(ch);
            }
        }
    }
    result.push(current.trim().to_string());

    result
}

fn parse_row_from_map(map: &HashMap<String, String>) -> ImportMemberRow {
    ImportMemberRow {
        姓名: map.get("姓名").cloned().unwrap_or_default(),
        姓氏: map.get("姓氏").and_then(|s| if s.is_empty() { None } else { Some(s.clone()) }),
        性别: map.get("性别").cloned().unwrap_or_default(),
        字辈: map.get("字辈").and_then(|s| if s.is_empty() { None } else { Some(s.clone()) }),
        排序: map.get("排序").and_then(|s| s.parse::<f64>().ok().map(|v| v as i32)),
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
        生平简介: map.get("生平简介").and_then(|s| if s.is_empty() { None } else { Some(s.clone()) }),
        突出事迹: map.get("突出事迹").and_then(|s| if s.is_empty() { None } else { Some(s.clone()) }),
    }
}

fn is_csv_content(content: &[u8]) -> bool {
    // CSV files start with printable ASCII characters
    // xlsx files start with PK (0x50, 0x4B) which is not printable ASCII
    if content.is_empty() {
        return false;
    }
    // Check first few bytes - xlsx starts with PK (ZIP format)
    if content.len() >= 2 && content[0] == 0x50 && content[1] == 0x4B {
        debug!(module="members", "[import] Detected xlsx (starts with PK)");
        return false;
    }
    // Check if content starts with printable ASCII or BOM
    let starts_valid = content[0] == 0xEF && content.len() >= 3 && content[1] == 0xBB && content[2] == 0xBF  // UTF-8 BOM
        || content[0] >= 0x20 && content[0] <= 0x7E  // Printable ASCII
        || content[0] >= 0xA0;  // High ASCII (likely UTF-8)
    debug!(module="members", "[import] is_csv_content check: first bytes {:?}, result: {}", &content[..content.len().min(10)], starts_valid);
    starts_valid
}

pub async fn get_members(
    State(state): State<AppState>,
) -> (StatusCode, Json<Value>) {
    let conn = match state.db.lock() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))),
    };

    let mut stmt = match conn.prepare(
        "SELECT id, name, surname, gender, generation, generation_word, weight, birth_date, death_date, is_deceased,
         birth_place, occupation, photo_path, biography, remarkable_deeds, is_matrilocal, is_adopted_son, created_at, updated_at
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
            generation_word: row.get(5)?,
            weight: row.get(6)?,
            birth_date: row.get(7)?,
            death_date: row.get(8)?,
            is_deceased: row.get::<_, i32>(9)? != 0,
            birth_place: row.get(10)?,
            occupation: row.get(11)?,
            photo_path: row.get(12)?,
            biography: row.get(13)?,
            remarkable_deeds: row.get(14)?,
            is_matrilocal: row.get::<_, i32>(15)? != 0,
            is_adopted_son: row.get::<_, i32>(16)? != 0,
            created_at: row.get(17)?,
            updated_at: row.get(18)?,
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
        "SELECT id, name, surname, gender, generation, generation_word, weight, birth_date, death_date, is_deceased,
         birth_place, occupation, photo_path, biography, remarkable_deeds, is_matrilocal, is_adopted_son, created_at, updated_at
         FROM family_members WHERE id = ?",
        params![id],
        |row| {
            Ok(Member {
                id: row.get(0)?,
                name: row.get(1)?,
                surname: row.get(2)?,
                gender: row.get(3)?,
                generation: row.get(4)?,
                generation_word: row.get(5)?,
                weight: row.get(6)?,
                birth_date: row.get(7)?,
                death_date: row.get(8)?,
                is_deceased: row.get::<_, i32>(9)? != 0,
                birth_place: row.get(10)?,
                occupation: row.get(11)?,
                photo_path: row.get(12)?,
                biography: row.get(13)?,
                remarkable_deeds: row.get(14)?,
                is_matrilocal: row.get::<_, i32>(15)? != 0,
                is_adopted_son: row.get::<_, i32>(16)? != 0,
                created_at: row.get(17)?,
                updated_at: row.get(18)?,
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
        "INSERT INTO family_members (name, surname, gender, generation, generation_word, weight, birth_date, death_date, is_deceased,
         birth_place, occupation, photo_path, biography, remarkable_deeds, is_matrilocal, is_adopted_son) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            req.name,
            req.surname,
            req.gender,
            req.generation_word,
            req.weight.unwrap_or(0),
            req.birth_date,
            req.death_date,
            req.is_deceased.unwrap_or(false),
            req.birth_place,
            req.occupation,
            req.photo_path,
            req.biography,
            req.remarkable_deeds,
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

    debug!(module="members", "[UPDATE_MEMBER] user_id: {}, user_role: {}", user_id, user_role);

    // 获取用户关联的成员ID
    let user_member_id: Option<i64> = conn
        .query_row(
            "SELECT member_id FROM users WHERE id = ?",
            params![user_id],
            |row| row.get(0),
        )
        .ok();

    debug!(module="members", "[UPDATE_MEMBER] target_id: {}, user_member_id: {:?}", id, user_member_id);

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
    // 注意：generation 不允许手动更新，由系统根据父子关系自动计算
    if let Some(ref generation_word) = req.generation_word {
        updates.push("generation_word = ?");
        values.push(Box::new(generation_word.clone()));
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
    if let Some(ref remarkable_deeds) = req.remarkable_deeds {
        updates.push("remarkable_deeds = ?");
        values.push(Box::new(remarkable_deeds.clone()));
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

    debug!(module="members", "[UPDATE_MEMBER] user_id: {}, user_role: {}", user_id, user_role);

    // 获取用户关联的成员ID
    let user_member_id: Option<i64> = conn
        .query_row(
            "SELECT member_id FROM users WHERE id = ?",
            params![user_id],
            |row| row.get(0),
        )
        .ok();

    debug!(module="members", "[UPDATE_MEMBER] target_id: {}, user_member_id: {:?}", id, user_member_id);

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

    debug!(module="members", "[EDITABLE_IDS] user_id: {}, role: {}", user_id, user_role);

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

    debug!(module="members", "[EDITABLE_IDS] user_member_id: {:?}", user_member_id);

    // 普通用户只能编辑自己绑定的成员
    let editable_ids: Vec<i64> = user_member_id.map(|id| vec![id])
        .unwrap_or_default();

    debug!(module="members", "[EDITABLE_IDS] editable_ids: {:?}", editable_ids);

    (StatusCode::OK, Json(json!({ "data": editable_ids })))
}
