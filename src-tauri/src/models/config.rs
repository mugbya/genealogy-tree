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
    pub family_surname: String,
    pub family_origin: String,
    pub family_maxim: String,
    pub family_generation_words: String,
}

pub const CONFIG_ALLOW_CREATE_FAMILY: &str = "allow_create_family";
pub const CONFIG_ALLOW_PUBLIC_ACCESS: &str = "allow_public_access";
pub const CONFIG_FAMILY_NAME: &str = "family_name";
pub const CONFIG_FAMILY_SURNAME: &str = "family_surname";
pub const CONFIG_FAMILY_ORIGIN: &str = "family_origin";
pub const CONFIG_FAMILY_MAXIM: &str = "family_maxim";
pub const CONFIG_FAMILY_GENERATION_WORDS: &str = "family_generation_words";
pub const CONFIG_HTTP_PORT: &str = "http_port";
pub const CONFIG_HTTPS_PORT: &str = "https_port";
