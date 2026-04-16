use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use chrono::{Duration, Utc};
use uuid::Uuid;
use crate::models::JwtClaims;
use std::sync::Arc;
use std::sync::Mutex;
use rusqlite::Connection;

const JWT_SECRET: &[u8] = b"genealogy_secret_key_change_in_production";
const TOKEN_EXPIRE_HOURS: i64 = 24 * 7;

pub fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| e.to_string())
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, String> {
    let parsed_hash = PasswordHash::new(hash).map_err(|e| e.to_string())?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

pub fn create_token(user_id: i64, username: &str, role: &str) -> Result<String, String> {
    let expiration = Utc::now()
        .checked_add_signed(Duration::hours(TOKEN_EXPIRE_HOURS))
        .expect("valid timestamp")
        .timestamp() as usize;

    let now = Utc::now().timestamp() as usize;
    let jti = Uuid::new_v4().to_string();

    let claims = JwtClaims {
        sub: user_id,
        username: username.to_string(),
        role: role.to_string(),
        exp: expiration,
        iat: now,
        jti,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(JWT_SECRET),
    )
    .map_err(|e| e.to_string())
}

pub fn verify_token(token: &str) -> Result<JwtClaims, String> {
    decode::<JwtClaims>(
        token,
        &DecodingKey::from_secret(JWT_SECRET),
        &Validation::default(),
    )
    .map(|data| data.claims)
    .map_err(|e| e.to_string())
}

// 检查 token 是否已被撤销（需要传入数据库连接）
pub fn verify_token_with_revocation_check(
    token: &str,
    db: &Arc<Mutex<Connection>>,
) -> Result<JwtClaims, String> {
    let claims = verify_token(token)?;

    let conn = db.lock().map_err(|e| e.to_string())?;

    // 检查特定 JTI 是否被撤销
    let revoked: Result<i64, _> = conn.query_row(
        "SELECT COUNT(*) FROM revoked_tokens WHERE token_jti = ?",
        rusqlite::params![claims.jti],
        |row| row.get(0),
    );

    match revoked {
        Ok(count) if count > 0 => return Err("Token has been revoked".to_string()),
        Err(e) => return Err(e.to_string()),
        _ => {}
    }

    // 检查是否有全局撤销标记（__revoke_all__）
    // 如果有，需要检查 token 是否是在撤销之前创建的
    let global_revoke: Result<(String, String), _> = conn.query_row(
        "SELECT revoked_at, expires_at FROM revoked_tokens WHERE token_jti = '__revoke_all__'",
        [],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    );

    if let Ok((revoked_at, _)) = global_revoke {
        // 解析撤销时间
        if let Ok(revoked_time) = chrono::NaiveDateTime::parse_from_str(&revoked_at, "%Y-%m-%d %H:%M:%S") {
            let token_iat = chrono::DateTime::from_timestamp(claims.iat as i64, 0)
                .map(|dt| dt.naive_utc())
                .unwrap_or_else(|| chrono::Utc::now().naive_utc());

            if token_iat < revoked_time {
                return Err("Token has been revoked (global revoke)".to_string());
            }
        }
    }

    Ok(claims)
}
