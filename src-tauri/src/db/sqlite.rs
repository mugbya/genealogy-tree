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
            generation INTEGER,
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

    Ok(conn)
}
