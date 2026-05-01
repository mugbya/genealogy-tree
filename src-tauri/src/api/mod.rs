mod router;
pub mod handlers;

// Explicit re-exports to avoid glob shadowing
#[allow(unused_imports)]
pub use router::{create_router, AppState};
#[allow(unused_imports)]
pub use handlers::{
    // auth - keep as mod, not re-exported
    config::{
        get_all_configs, get_config, set_config, set_configs_batch, delete_config, get_public_config,
    },
    health::health_check,
    license::{get_license_info, activate_license, verify_license, check_feature},
    members::{
        get_members, create_member, get_member, update_member, delete_member,
        import_members, recalculate_all_generations, get_editable_member_ids,
    },
    member_relations::{
        get_member_relations, create_member_relation, delete_member_relation, get_member_relations_by_member,
    },
    relation_tags::{
        get_relation_tags, create_relation_tag, update_relation_tag, delete_relation_tag,
    },
    system::{get_system_info, get_network_interfaces},
    template::download_template,
    usage_report::{check_and_report, start_report_timer},
    wechat::{
        WechatLoginStore, generate_qrcode, check_login_status,
        simulate_scan_confirm, wechat_callback, cleanup_expired_sessions,
    },
};
