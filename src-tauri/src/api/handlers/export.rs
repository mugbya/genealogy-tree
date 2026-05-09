use axum::{
    extract::State,
    http::{header, StatusCode},
    response::Response,
    Json,
};
use rusqlite::params;
use serde::Deserialize;
use std::collections::HashMap;

use crate::api::router::AppState;
use crate::license::{is_feature_allowed, LicenseFeature, get_license_info};

/// 导出 HTML 的请求参数
#[derive(Debug, Deserialize)]
pub struct ExportHtmlRequest {
    pub volume: Option<ExportVolume>,  // 可选，如果不传则导出全部，分册导出不需要授权
}

#[derive(Debug, Deserialize)]
pub struct ExportVolume {
    pub start_generation: Option<i32>,
    pub end_generation: Option<i32>,
}

/// 生成完整的 HTML 文档
fn generate_html(
    members: Vec<ExportMember>,
    relations: HashMap<i64, ExportRelations>,
    family_name: &str,
    family_maxim: &str,
    family_origin: &str,
    generation_count: usize,
    volume_start: Option<i32>,
    volume_end: Option<i32>,
) -> String {
    // 按 generation 和 weight 排序
    let mut sorted_members = members.clone();
    sorted_members.sort_by(|a, b| {
        let gen_a: i32 = a.generation.as_ref().and_then(|s| s.parse().ok()).unwrap_or(0);
        let gen_b: i32 = b.generation.as_ref().and_then(|s| s.parse().ok()).unwrap_or(0);
        gen_a.cmp(&gen_b).then(a.weight.cmp(&b.weight))
    });

    let member_count = sorted_members.len();
    let member_map: HashMap<i64, &ExportMember> = sorted_members.iter()
        .map(|m| (m.id, m))
        .collect();

    // 判断是否为分册导出
    let is_volume = volume_start.is_some() || volume_end.is_some();
    let volume_info = if is_volume {
        format!(r#"<p style="font-size: 16px; color: #92400e; margin: 0 0 2mm 0;">（第 {} 代 ~ 第 {} 代）</p>"#,
            volume_start.unwrap_or(1), volume_end.unwrap_or(1))
    } else {
        String::new()
    };

    // 生成分册或总数信息
    let volume_or_generation_text = if is_volume {
        format!("本册记载 第{}至{}代", volume_start.unwrap_or(1), volume_end.unwrap_or(1))
    } else {
        format!("传承 {} 代", generation_count)
    };

    // 生成封面HTML - 与前端 generateCoverHtml 保持一致
    let cover_html = format!(r#"
<div style="width: 210mm; min-height: 285mm; margin: 0 auto; background: linear-gradient(to bottom, #fffbeb, #fff7ed); border: 4px solid #92400e; position: relative; font-family: 'Noto Sans SC', 'SimSun', sans-serif; box-sizing: border-box;">
  <!-- 装饰边框 -->
  <div style="position: absolute; inset: 2mm; border: 2px solid #92400e; pointer-events: none;"></div>
  <div style="position: absolute; inset: 8mm; border: 1px solid #d97706; pointer-events: none;"></div>

  <!-- 四角装饰 -->
  <div style="position: absolute; top: 4mm; left: 4mm; width: 8mm; height: 8mm;">
    <svg viewBox="0 0 40 40" style="width: 100%; height: 100%; color: #92400e;">
      <path d="M2 38 Q2 2 38 2" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="8" cy="8" r="3" fill="currentColor"/>
    </svg>
  </div>
  <div style="position: absolute; top: 4mm; right: 4mm; width: 8mm; height: 8mm; transform: rotate(90deg);">
    <svg viewBox="0 0 40 40" style="width: 100%; height: 100%; color: #92400e;">
      <path d="M2 38 Q2 2 38 2" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="8" cy="8" r="3" fill="currentColor"/>
    </svg>
  </div>
  <div style="position: absolute; bottom: 4mm; left: 4mm; width: 8mm; height: 8mm; transform: rotate(-90deg);">
    <svg viewBox="0 0 40 40" style="width: 100%; height: 100%; color: #92400e;">
      <path d="M2 38 Q2 2 38 2" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="8" cy="8" r="3" fill="currentColor"/>
    </svg>
  </div>
  <div style="position: absolute; bottom: 4mm; right: 4mm; width: 8mm; height: 8mm; transform: rotate(180deg);">
    <svg viewBox="0 0 40 40" style="width: 100%; height: 100%; color: #92400e;">
      <path d="M2 38 Q2 2 38 2" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="8" cy="8" r="3" fill="currentColor"/>
    </svg>
  </div>

  <!-- 徽章 -->
  <div style="display: flex; justify-content: center; padding-top: 30mm;">
    <div style="width: 50mm; height: 50mm; position: relative;">
      <div style="position: absolute; inset: 0; border-radius: 50%; border: 4px solid #92400e; background: linear-gradient(135deg, #fef3c7, #fde68a); box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <div style="position: absolute; inset: 4mm; border-radius: 50%; border: 2px solid #b45309; display: flex; align-items: center; justify-content: center;">
          <div style="font-size: 48px; color: #78350f; font-family: serif;">谱</div>
        </div>
      </div>
    </div>
  </div>

  <!-- 家族名称 -->
  <div style="text-align: center; padding: 0 15mm; margin-top: 10mm;">
    <h1 style="font-size: 36px; font-weight: bold; color: #78350f; letter-spacing: 4px; margin: 0 0 4px 0;">
      {family_name}
    </h1>
    <p style="font-size: 18px; color: #b45309; letter-spacing: 4px;">祖谱</p>

    <div style="display: flex; align-items: center; justify-content: center; gap: 5mm; margin: 8mm 0;">
      <div style="height: 1px; width: 25mm; background: linear-gradient(to right, transparent, #d97706);"></div>
      <div style="display: flex; gap: 2mm;">
        <span style="color: #d97706; font-size: 10px;">◆</span>
        <span style="color: #d97706;">◆</span>
        <span style="color: #d97706; font-size: 10px;">◆</span>
      </div>
      <div style="height: 1px; width: 25mm; background: linear-gradient(to left, transparent, #d97706);"></div>
    </div>

    <div style="display: inline-block; padding: 2mm 6mm; border: 1px solid #b45309; border-radius: 4px; background: #fffbeb;">
      <span style="font-size: 14px; color: #78350f;">现代版</span>
    </div>
  </div>

  <div style="margin: 8mm 15mm; padding: 4mm; background: rgba(254, 243, 199, 0.5); border: 1px solid #fcd34d; border-radius: 4px; text-align: center;">
    <p style="font-size: 14px; color: #78350f; font-style: italic; margin: 0;">
      {family_maxim}
    </p>
  </div>

  <div style="text-align: center; margin-top: 4mm; padding: 0 15mm;">
    <p style="font-size: 12px; color: #b45309;">
      始祖源地：{family_origin}
    </p>
  </div>

  <div style="position: absolute; bottom: 25mm; left: 0; right: 0; text-align: center;">
    {volume_info}
    <p style="font-size: 14px; color: #b45309; margin: 0;">
      共录 <span style="font-weight: bold; color: #78350f;">{member_count}</span> 名族人
    </p>
    <p style="font-size: 12px; color: #d97706; margin: 2mm 0 0 0;">
      {volume_or_generation_text}
    </p>
  </div>
</div>"#);

    // 生成目录HTML
    let toc_rows: String = sorted_members.iter().enumerate().map(|(i, m)| {
        let gen_num: i32 = m.generation.as_ref().and_then(|s| s.parse().ok()).unwrap_or(0);
        format!(r#"
      <tr style="color: #3f3f46; border-bottom: 1px solid #fef3c7;">
        <td style="padding: 8px 4px;">{}</td>
        <td style="padding: 8px 4px;">{}</td>
        <td style="padding: 8px 4px;">{}</td>
        <td style="padding: 8px 4px;">{}</td>
        <td style="padding: 8px 4px;">{}</td>
      </tr>"#,
            i + 1,
            if gen_num > 0 { format!("第{}代", gen_num) } else { "-".to_string() },
            m.generation_word.as_deref().unwrap_or("-"),
            &m.name,
            m.birth_date.as_ref().and_then(|d| d.get(0..4)).unwrap_or("-")
        )
    }).collect();

    let toc_html = format!(r#"
<div style="width: 210mm; min-height: 297mm; margin: 0 auto; background: white; padding: 15mm 20mm; font-family: 'Noto Sans SC', 'SimSun', sans-serif; box-sizing: border-box; page-break-after: always;">
  <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #f59e0b;">
    <h1 style="font-size: 24px; font-weight: bold; color: #78350f; letter-spacing: 4px; margin: 0;">{}</h1>
    <p style="color: #b45309; font-size: 18px; margin: 4px 0 0 0;">成员索引</p>
  </div>
  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    <thead>
      <tr style="color: #78350f; border-bottom: 1px solid #fde68a;">
        <th style="text-align: left; padding: 8px 4px; font-weight: 500;">页码</th>
        <th style="text-align: left; padding: 8px 4px; font-weight: 500;">代数</th>
        <th style="text-align: left; padding: 8px 4px; font-weight: 500;">字辈</th>
        <th style="text-align: left; padding: 8px 4px; font-weight: 500;">姓名</th>
        <th style="text-align: left; padding: 8px 4px; font-weight: 500;">生年</th>
      </tr>
    </thead>
    <tbody>
      {}
    </tbody>
  </table>
</div>"#, family_name, toc_rows);

    // 生成成员详情HTML
    let members_html: String = sorted_members.iter().enumerate().map(|(index, m)| {
        let rels = relations.get(&m.id);
        let father_info = rels.and_then(|r| r.father_id.and_then(|fid| member_map.get(&fid)));
        let mother_info = rels.and_then(|r| r.mother_id.and_then(|mid| member_map.get(&mid)));
        let spouses: Vec<&ExportMember> = rels
            .map(|r| r.spouse_ids.iter())
            .into_iter()
            .flatten()
            .filter_map(|sid| member_map.get(&sid))
            .copied()
            .collect();
        let children: Vec<&ExportMember> = rels
            .map(|r| r.children.iter())
            .into_iter()
            .flatten()
            .filter_map(|cid| member_map.get(&cid))
            .copied()
            .collect();

        let gen_num: i32 = m.generation.as_ref().and_then(|s| s.parse().ok()).unwrap_or(0);
        let gen_display = if gen_num > 0 && m.generation_word.is_some() {
            format!("第{}代 · {}", gen_num, m.generation_word.as_ref().unwrap())
        } else if gen_num > 0 {
            format!("第{}代", gen_num)
        } else {
            m.generation_word.clone().unwrap_or_default()
        };

        let mut details = String::new();

        if let Some(gender) = &m.gender {
            details.push_str(&format!(r#"
            <tr><td style="padding: 8px; color: #666; width: 80px;">性别</td><td style="padding: 8px;">{}</td></tr>"#,
                if gender == "male" { "男" } else { "女" }
            ));
        }

        if m.birth_date.is_some() || m.death_date.is_some() {
            let birth = m.birth_date.as_deref().unwrap_or("未知");
            let death = m.death_date.as_deref().map(|d| format!(" ～ {}", d)).unwrap_or_default();
            details.push_str(&format!(r#"
            <tr><td style="padding: 8px; color: #666;">生卒</td><td style="padding: 8px;">{}{}</td></tr>"#, birth, death));
        }

        if let Some(place) = &m.birth_place {
            details.push_str(&format!(r#"
            <tr><td style="padding: 8px; color: #666;">籍贯</td><td style="padding: 8px;">{}</td></tr>"#, place));
        }

        if let Some(occupation) = &m.occupation {
            details.push_str(&format!(r#"
            <tr><td style="padding: 8px; color: #666;">职业</td><td style="padding: 8px;">{}</td></tr>"#, occupation));
        }

        let mut family_relations = String::new();
        if let Some(father) = father_info {
            family_relations.push_str(&format!(r#"<p style="font-size: 14px; margin: 5px 0;"><span style="color: #666;">父亲：</span>{}</p>"#, father.name));
        }
        if let Some(mother) = mother_info {
            family_relations.push_str(&format!(r#"<p style="font-size: 14px; margin: 5px 0;"><span style="color: #666;">母亲：</span>{}</p>"#, mother.name));
        }
        if !spouses.is_empty() {
            family_relations.push_str(&format!(r#"<p style="font-size: 14px; margin: 5px 0;"><span style="color: #666;">配偶：</span>{}</p>"#,
                spouses.iter().map(|s| s.name.as_str()).collect::<Vec<_>>().join("、")));
        }
        if !children.is_empty() {
            family_relations.push_str(&format!(r#"<p style="font-size: 14px; margin: 5px 0;"><span style="color: #666;">子女：</span>{}</p>"#,
                children.iter().map(|c| c.name.as_str()).collect::<Vec<_>>().join("、")));
        }

        let biography_section = if let Some(bio) = &m.biography {
            format!(r#"
          <div style="margin-top: 20px;">
            <h3 style="font-size: 16px; color: #333; margin: 0 0 10px 0;">生平简介</h3>
            <hr style="border: none; border-top: 1px solid #333; width: 60px; margin: 0 0 10px 0;">
            <p style="font-size: 14px; line-height: 1.8; color: #333; margin: 0;">{}</p>
          </div>"#, bio)
        } else {
            String::new()
        };

        let deeds_section = if let Some(deeds) = &m.remarkable_deeds {
            format!(r#"
          <div style="margin-top: 20px;">
            <h3 style="font-size: 16px; color: #333; margin: 0 0 10px 0;">主要成就</h3>
            <hr style="border: none; border-top: 1px solid #333; width: 60px; margin: 0 0 10px 0;">
            <p style="font-size: 14px; line-height: 1.8; color: #333; margin: 0;">{}</p>
          </div>"#, deeds)
        } else {
            String::new()
        };

        format!(r#"
        <div style="width: 210mm; min-height: 285mm; margin: 0 auto; background: white; padding: 20mm; font-family: 'Noto Sans SC', 'SimSun', sans-serif; box-sizing: border-box; page-break-after: always; position: relative;">
          <h1 style="font-size: 36px; text-align: center; color: #333; margin: 0 0 10px 0;">{}{}</h1>
          <p style="font-size: 14px; color: #666; text-align: center; margin: 0 0 30px 0;">
            {}
          </p>
          <hr style="border: none; border-top: 1px solid #333; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            {}
          </table>
          {}
          {}
          {}
          <p style="position: absolute; bottom: 20px; left: 0; right: 0; text-align: center; font-size: 12px; color: #999; margin: 0;">
            {} · 第{}页
          </p>
        </div>"#,
            &m.name,
            if m.is_deceased { "<span style=\"font-size: 14px; color: #999;\">（故）</span>" } else { "" },
            gen_display,
            details,
            if !family_relations.is_empty() {
                format!(r#"
          <div style="margin-top: 20px;">
            <h3 style="font-size: 16px; color: #333; margin: 0 0 10px 0;">家族关系</h3>
            <hr style="border: none; border-top: 1px solid #333; width: 60px; margin: 0 0 10px 0;">
            {}
          </div>"#, family_relations)
            } else { String::new() },
            biography_section,
            deeds_section,
            family_name,
            index + 1
        )
    }).collect();

    // 生成完整HTML
    format!(r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{}族谱</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ font-family: 'Noto Sans SC', 'SimSun', sans-serif; }}
    @page {{ margin: 10mm; size: A4; }}
  </style>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
</head>
<body>
{}
{}
{}
</body>
</html>"#, family_name, cover_html, toc_html, members_html)
}

/// 获取导出的成员信息（精简版）
#[derive(Debug, Clone)]
struct ExportMember {
    id: i64,
    name: String,
    surname: Option<String>,
    gender: Option<String>,
    generation: Option<String>,
    generation_word: Option<String>,
    weight: i32,
    birth_date: Option<String>,
    death_date: Option<String>,
    is_deceased: bool,
    birth_place: Option<String>,
    occupation: Option<String>,
    biography: Option<String>,
    remarkable_deeds: Option<String>,
}

#[derive(Debug, Default)]
struct ExportRelations {
    father_id: Option<i64>,
    mother_id: Option<i64>,
    spouse_ids: Vec<i64>,
    children: Vec<i64>,
}

/// 导出 HTML
pub async fn export_html(
    State(state): State<AppState>,
    Json(req): Json<ExportHtmlRequest>,
) -> Result<Response, StatusCode> {
    // 1. 检查授权（始终检查授权，无论是导出全部还是分册导出）
    let license_info = get_license_info(&state.db)
        .map_err(|e| {
            tracing::warn!("Failed to get license info: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let allowed = is_feature_allowed(
        LicenseFeature::ExportHtml,
        license_info.auth_code.as_deref(),
        license_info.expires_at.as_deref(),
        license_info.license_type.as_deref(),
    );

    if !allowed {
        tracing::warn!("Export HTML denied: feature not allowed");
        return Err(StatusCode::FORBIDDEN);
    }

    // 2. 获取家族配置信息
    let (family_name, family_maxim, family_origin) = {
        let conn = state.db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let family_name = conn.query_row(
            "SELECT value FROM family_config WHERE key = 'family_name'",
            [],
            |row| row.get::<_, String>(0)
        ).unwrap_or_else(|_| "某某家族".to_string());

        let family_maxim = conn.query_row(
            "SELECT value FROM family_config WHERE key = 'family_maxim'",
            [],
            |row| row.get::<_, String>(0)
        ).unwrap_or_else(|_| "传承家族文化  弘扬优良家风".to_string());

        let family_origin = conn.query_row(
            "SELECT value FROM family_config WHERE key = 'family_origin'",
            [],
            |row| row.get::<_, String>(0)
        ).unwrap_or_else(|_| "源远流长".to_string());

        (family_name, family_maxim, family_origin)
    };

    // 3. 获取成员数据（根据 volume 参数过滤）
    let members: Vec<ExportMember> = {
        let conn = state.db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // 根据是否分册导出构建不同的查询
        let query = if req.volume.is_some() {
            "SELECT id, name, surname, gender, generation, generation_word, weight,
             birth_date, death_date, is_deceased, birth_place, occupation,
             biography, remarkable_deeds
             FROM family_members
             WHERE CAST(generation AS INTEGER) >= ? AND CAST(generation AS INTEGER) <= ?
             ORDER BY CAST(generation AS INTEGER), weight"
        } else {
            "SELECT id, name, surname, gender, generation, generation_word, weight,
             birth_date, death_date, is_deceased, birth_place, occupation,
             biography, remarkable_deeds
             FROM family_members ORDER BY CAST(generation AS INTEGER), weight"
        };

        let mut stmt = conn.prepare(query).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // 根据是否分册导出获取不同范围的成员
        if let Some(ref volume) = req.volume {
            let start = volume.start_generation.unwrap_or(1);
            let end = volume.end_generation.unwrap_or(i32::MAX);
            let rows = stmt.query_map(params![start, end], |row| {
                Ok(ExportMember {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    surname: row.get(2)?,
                    gender: row.get(3)?,
                    generation: row.get(4)?,
                    generation_word: row.get(5)?,
                    weight: row.get(6)?,
                    birth_date: row.get(7)?,
                    death_date: row.get(8)?,
                    is_deceased: row.get(9)?,
                    birth_place: row.get(10)?,
                    occupation: row.get(11)?,
                    biography: row.get(12)?,
                    remarkable_deeds: row.get(13)?,
                })
            }).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            rows.filter_map(|r| r.ok()).collect()
        } else {
            let rows = stmt.query_map([], |row| {
                Ok(ExportMember {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    surname: row.get(2)?,
                    gender: row.get(3)?,
                    generation: row.get(4)?,
                    generation_word: row.get(5)?,
                    weight: row.get(6)?,
                    birth_date: row.get(7)?,
                    death_date: row.get(8)?,
                    is_deceased: row.get(9)?,
                    birth_place: row.get(10)?,
                    occupation: row.get(11)?,
                    biography: row.get(12)?,
                    remarkable_deeds: row.get(13)?,
                })
            }).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            rows.filter_map(|r| r.ok()).collect()
        }
    };

    if members.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    // 4. 获取关系数据
    let relations: HashMap<i64, ExportRelations> = {
        let conn = state.db.lock().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let mut stmt = conn.prepare(
            "SELECT from_member_id, to_member_id, relation_type FROM member_relations"
        ).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let mut relations_map: HashMap<i64, ExportRelations> = HashMap::new();
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?))
        }).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        for row in rows.filter_map(|r| r.ok()) {
            let (from, to, rel_type) = row;
            let entry = relations_map.entry(from).or_default();
            match rel_type.as_str() {
                "father" => entry.father_id = Some(to),
                "mother" => entry.mother_id = Some(to),
                "spouse" => entry.spouse_ids.push(to),
                "son" | "daughter" => entry.children.push(to),
                _ => {}
            }
        }

        relations_map
    };

    // 5. 计算代数（generation）数量
    let generation_count = {
        let mut generations: std::collections::HashSet<i32> = std::collections::HashSet::new();
        for m in &members {
            if let Some(gen) = m.generation.as_ref().and_then(|s| s.parse::<i32>().ok()) {
                generations.insert(gen);
            }
        }
        generations.len()
    };

    // 获取分册参数
    let (volume_start, volume_end) = if let Some(ref volume) = req.volume {
        (Some(volume.start_generation.unwrap_or(1)), Some(volume.end_generation.unwrap_or(i32::MAX)))
    } else {
        (None, None)
    };

    // 6. 生成 HTML
    let html_content = generate_html(
        members,
        relations,
        &family_name,
        &family_maxim,
        &family_origin,
        generation_count,
        volume_start,
        volume_end,
    );

    // 7. 构建响应 - 使用 RFC 5987 编码的文件名
    let filename = if let Some(ref volume) = req.volume {
        format!("{}-族谱（第{}至{}代）.html", family_name, volume.start_generation.unwrap_or(1), volume.end_generation.unwrap_or(0))
    } else {
        format!("{}-族谱.html", family_name)
    };

    let mut response = Response::new(html_content.into());
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        "text/html; charset=utf-8".parse().unwrap(),
    );

    // 使用 URL 编码的 filename* 参数（RFC 5987）
    let encoded_filename = urlencoding::encode(&filename);
    let content_disposition = format!("attachment; filename=\"{}\"; filename*=UTF-8''{}",
        filename, encoded_filename);
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        content_disposition.parse().unwrap(),
    );

    Ok(response)
}
