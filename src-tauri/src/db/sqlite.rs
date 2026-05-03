use rusqlite::{Connection, Result};
use std::path::Path;

pub fn init_database(db_path: &Path) -> Result<Connection> {
    let conn = Connection::open(db_path)?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS family_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            surname TEXT,
            gender TEXT NOT NULL DEFAULT 'male',
            generation TEXT,
            weight INTEGER NOT NULL DEFAULT 0,
            birth_date TEXT,
            death_date TEXT,
            is_deceased INTEGER NOT NULL DEFAULT 0,
            birth_place TEXT,
            occupation TEXT,
            photo_path TEXT,
            biography TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;

    // Migration: Check table schema to see if columns need to be added
    let has_generation = conn
        .prepare("PRAGMA table_info(family_members)")
        .ok()
        .map(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .ok()
                .map(|rows| rows.filter_map(|r| r.ok()).collect::<Vec<String>>())
        })
        .flatten()
        .map(|cols| cols.contains(&"generation".to_string()))
        .unwrap_or(false);

    // If generation column doesn't exist, add it
    if !has_generation {
        let _ = conn.execute("ALTER TABLE family_members ADD COLUMN generation TEXT", []);
    }

    // Migration: add is_deceased column if it doesn't exist (for existing databases)
    let has_is_deceased: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('family_members') WHERE name = 'is_deceased'",
        [],
        |row| Ok(row.get::<_, i32>(0)? > 0),
    ).unwrap_or(false);

    if !has_is_deceased {
        conn.execute("ALTER TABLE family_members ADD COLUMN is_deceased INTEGER NOT NULL DEFAULT 0", [])?;
    }

    // Migration: add surname column if it doesn't exist (for existing databases)
    let has_surname: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('family_members') WHERE name = 'surname'",
        [],
        |row| Ok(row.get::<_, i32>(0)? > 0),
    ).unwrap_or(false);

    if !has_surname {
        conn.execute("ALTER TABLE family_members ADD COLUMN surname TEXT", [])?;
    }

    // Migration: add is_matrilocal column if it doesn't exist (for existing databases)
    let has_is_matrilocal: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('family_members') WHERE name = 'is_matrilocal'",
        [],
        |row| Ok(row.get::<_, i32>(0)? > 0),
    ).unwrap_or(false);

    if !has_is_matrilocal {
        conn.execute("ALTER TABLE family_members ADD COLUMN is_matrilocal INTEGER NOT NULL DEFAULT 0", [])?;
    }

    // Migration: add is_adopted_son column if it doesn't exist (for existing databases)
    let has_is_adopted_son: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('family_members') WHERE name = 'is_adopted_son'",
        [],
        |row| Ok(row.get::<_, i32>(0)? > 0),
    ).unwrap_or(false);

    if !has_is_adopted_son {
        conn.execute("ALTER TABLE family_members ADD COLUMN is_adopted_son INTEGER NOT NULL DEFAULT 0", [])?;
    }

    // Migration: add weight column if it doesn't exist (for existing databases)
    let has_weight: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('family_members') WHERE name = 'weight'",
        [],
        |row| Ok(row.get::<_, i32>(0)? > 0),
    ).unwrap_or(false);

    if !has_weight {
        conn.execute("ALTER TABLE family_members ADD COLUMN weight INTEGER NOT NULL DEFAULT 0", [])?;
    }

    // Migration: add remarkable_deeds column if it doesn't exist (for existing databases)
    let has_remarkable_deeds: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('family_members') WHERE name = 'remarkable_deeds'",
        [],
        |row| Ok(row.get::<_, i32>(0)? > 0),
    ).unwrap_or(false);

    if !has_remarkable_deeds {
        conn.execute("ALTER TABLE family_members ADD COLUMN remarkable_deeds TEXT", [])?;
    }

    // Migration: add death_date column if it doesn't exist (for existing databases)
    let has_death_date: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('family_members') WHERE name = 'death_date'",
        [],
        |row| Ok(row.get::<_, i32>(0)? > 0),
    ).unwrap_or(false);

    if !has_death_date {
        conn.execute("ALTER TABLE family_members ADD COLUMN death_date TEXT", [])?;
    }

    // Migration: add generation_word column if it doesn't exist (for existing databases)
    let has_generation_word: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('family_members') WHERE name = 'generation_word'",
        [],
        |row| Ok(row.get::<_, i32>(0)? > 0),
    ).unwrap_or(false);

    if !has_generation_word {
        conn.execute("ALTER TABLE family_members ADD COLUMN generation_word TEXT", [])?;
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS relation_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            tag_type TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#000000',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS member_relations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_member_id INTEGER NOT NULL,
            to_member_id INTEGER NOT NULL,
            relation_type TEXT NOT NULL,
            tag_id INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (from_member_id) REFERENCES family_members(id) ON DELETE CASCADE,
            FOREIGN KEY (to_member_id) REFERENCES family_members(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES relation_tags(id) ON DELETE SET NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS family_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL UNIQUE,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;

    // 初始化默认的 HTTP 和 HTTPS 端口配置
    conn.execute(
        "INSERT OR IGNORE INTO family_config (key, value) VALUES ('http_port', '8089')",
        [],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO family_config (key, value) VALUES ('https_port', '8443')",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            member_id INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (member_id) REFERENCES family_members(id)
        )",
        [],
    )?;

    // 登录历史表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS login_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            login_status TEXT NOT NULL,
            fail_reason TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )",
        [],
    )?;

    // 被撤销的 tokens 表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS revoked_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_jti TEXT NOT NULL UNIQUE,
            revoked_at TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at TEXT NOT NULL
        )",
        [],
    )?;

    // 清理过期的 revoked tokens（启动时清理）
    let _ = conn.execute("DELETE FROM revoked_tokens WHERE expires_at < datetime('now')", []);

    // 积压上报表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS pending_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_data TEXT NOT NULL,
            report_date TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )",
        [],
    )?;

    Ok(conn)
}
