use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationTag {
    pub id: i64,
    pub name: String,
    pub tag_type: String,
    pub color: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRelationTagRequest {
    pub name: String,
    pub tag_type: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRelationTagRequest {
    pub name: Option<String>,
    pub tag_type: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationTagType {
    pub value: String,
    pub label: String,
}

pub const RELATION_TAG_TYPES: &[(&str, &str)] = &[
    ("spouse", "配偶关系"),
    ("parent_child", "父母子女关系"),
    ("sibling", "兄弟姐妹关系"),
    ("special", "特殊标签"),
];
