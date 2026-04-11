use axum::{
    routing::{delete, get, post, put},
    Router,
};
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};
use rusqlite::Connection;

use crate::api::handlers;

pub fn create_router(db: Arc<Mutex<Connection>>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        // Health check
        .route("/api/health", get(handlers::health_check))
        // Auth (public)
        .route("/api/auth/register", post(handlers::auth::register))
        .route("/api/auth/login", post(handlers::auth::login))
        // Users (auth required)
        .route("/api/users/me", get(handlers::auth::get_current_user))
        .route("/api/users/:id", put(handlers::auth::update_user))
        .route("/api/users/:id", delete(handlers::auth::delete_user))
        // Admin only
        .route("/api/admin/users", get(handlers::auth::get_users))
        // Config (public for reading, auth for writing)
        .route("/api/config", get(handlers::config::get_all_configs))
        .route("/api/config/:key", get(handlers::config::get_config))
        .route("/api/config", post(handlers::config::set_config))
        .route("/api/config/:key", delete(handlers::config::delete_config))
        .route("/api/config/public", get(handlers::config::get_public_config))
        // Members (public for now, can add auth later)
        .route("/api/members", get(handlers::get_members))
        .route("/api/members", post(handlers::create_member))
        .route("/api/members/:id", get(handlers::get_member))
        .route("/api/members/:id", put(handlers::update_member))
        .route("/api/members/:id", delete(handlers::delete_member))
        // Member relations
        .route("/api/member-relations", get(handlers::get_member_relations))
        .route("/api/member-relations", post(handlers::create_member_relation))
        .route("/api/member-relations/:id", delete(handlers::delete_member_relation))
        .route("/api/members/:member_id/relations", get(handlers::get_member_relations_by_member))
        // Relation tags
        .route("/api/relation-tags", get(handlers::get_relation_tags))
        .route("/api/relation-tags", post(handlers::create_relation_tag))
        .route("/api/relation-tags/:id", put(handlers::update_relation_tag))
        .route("/api/relation-tags/:id", delete(handlers::delete_relation_tag))
        .layer(cors)
        .with_state(db)
}
