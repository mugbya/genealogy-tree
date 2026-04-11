use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub id: i64,
    pub key: String,
    pub value: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateConfigRequest {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateConfigRequest {
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigResponse {
    pub allow_create_family: bool,
    pub allow_public_access: bool,
    pub family_name: String,
}

pub const CONFIG_ALLOW_CREATE_FAMILY: &str = "allow_create_family";
pub const CONFIG_ALLOW_PUBLIC_ACCESS: &str = "allow_public_access";
pub const CONFIG_FAMILY_NAME: &str = "family_name";
