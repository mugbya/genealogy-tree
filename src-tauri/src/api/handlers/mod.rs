pub mod auth;
pub mod config;
pub mod export;
pub mod health;
pub mod license;
pub mod members;
pub mod member_relations;
pub mod relation_tags;
pub mod system;
pub mod template;
pub mod usage_report;
pub mod wechat;

// Explicitly re-export instead of glob to avoid shadowing warnings
pub use export::export_html;
pub use health::health_check;
pub use license::{get_license_info, activate_license, verify_license, check_feature, get_features};
pub use members::{
    get_members, create_member, get_member, update_member, delete_member,
    import_members, clear_and_import_members, recalculate_all_generations, get_editable_member_ids,
};
pub use member_relations::{
    get_member_relations, create_member_relation, delete_member_relation, get_member_relations_by_member,
};
pub use relation_tags::*;
pub use system::{get_system_info, get_network_interfaces};
pub use template::download_template;
pub use usage_report::*;
pub use wechat::*;