use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Member {
    pub id: i64,
    pub name: String,
    pub surname: Option<String>,
    pub gender: String,
    pub generation: Option<i32>,
    pub birth_date: Option<String>,
    pub death_date: Option<String>,
    pub is_deceased: bool,
    pub birth_place: Option<String>,
    pub occupation: Option<String>,
    pub photo_path: Option<String>,
    pub biography: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMemberRequest {
    pub name: String,
    pub surname: Option<String>,
    pub gender: String,
    pub generation: Option<i32>,
    pub birth_date: Option<String>,
    pub death_date: Option<String>,
    pub is_deceased: Option<bool>,
    pub birth_place: Option<String>,
    pub occupation: Option<String>,
    pub photo_path: Option<String>,
    pub biography: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateMemberRequest {
    pub name: Option<String>,
    pub surname: Option<String>,
    pub gender: Option<String>,
    pub generation: Option<i32>,
    pub birth_date: Option<String>,
    pub death_date: Option<String>,
    pub is_deceased: Option<bool>,
    pub birth_place: Option<String>,
    pub occupation: Option<String>,
    pub photo_path: Option<String>,
    pub biography: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemberRelation {
    pub id: i64,
    pub from_member_id: i64,
    pub to_member_id: i64,
    pub relation_type: String,
    pub tag_id: Option<i64>,
    pub created_at: String,
    #[serde(default)]
    pub from_member_name: Option<String>,
    #[serde(default)]
    pub from_member_gender: Option<String>,
    #[serde(default)]
    pub to_member_name: Option<String>,
    #[serde(default)]
    pub to_member_gender: Option<String>,
    #[serde(default)]
    pub tag_name: Option<String>,
    #[serde(default)]
    pub tag_color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMemberRelationRequest {
    pub from_member_id: i64,
    pub to_member_id: i64,
    pub relation_type: String,
    pub tag_id: Option<i64>,
}

pub const RELATION_TYPES: &[(&str, &str)] = &[
    ("spouse", "配偶"),
    ("father", "父亲"),
    ("mother", "母亲"),
    ("son", "儿子"),
    ("daughter", "女儿"),
    ("older_brother", "哥哥"),
    ("younger_brother", "弟弟"),
    ("older_sister", "姐姐"),
    ("younger_sister", "妹妹"),
];
