const path = require('path');
const fs = require('fs');

let DatabaseSync;

// Try Electron's Node built-in sqlite first, fall back to better-sqlite3
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  try {
    const BetterSqlite3 = require('better-sqlite3');
    DatabaseSync = class {
      constructor(dbPath) {
        this._db = new BetterSqlite3(dbPath);
        this._db.pragma('journal_mode = WAL');
      }
      exec(sql) { this._db.exec(sql); }
      prepare(sql) {
        const stmt = this._db.prepare(sql);
        return {
          run: (...args) => stmt.run(...args),
          get: (...args) => stmt.get(...args),
          all: (...args) => stmt.all(...args),
        };
      }
      close() { this._db.close(); }
    };
  } catch (e2) {
    throw new Error('No SQLite available. Install better-sqlite3: npm install better-sqlite3');
  }
}

// Data directory location is determined by the caller via setDataDir() or
// defaults to <projectRoot>/data for development. In production the installed
// app should call setDataDir(app.getPath('userData') + '/data').
let DATA_DIR = path.join(__dirname, '..', 'data');
let DB_PATH = path.join(DATA_DIR, 'usage.db');

function setDataDir(dir) {
  DATA_DIR = dir;
  DB_PATH = path.join(DATA_DIR, 'usage.db');
}

let db = null;

function getDb() {
  if (db) return db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  initSchema();
  runMigrations();
  return db;
}

function initSchema() {
  // Create tables only — indexes run after migrations so the provider column
  // exists on pre-existing databases before we try to index it.
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      uuid TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      timestamp_ms INTEGER NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      cwd TEXT,
      is_subagent INTEGER DEFAULT 0,
      source_file TEXT,
      tools_used TEXT,
      provider TEXT DEFAULT 'claude-code'
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp_ms);
    CREATE INDEX IF NOT EXISTS idx_messages_model ON messages(model);

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      title TEXT,
      cwd TEXT,
      model TEXT,
      created_at INTEGER,
      last_activity_at INTEGER,
      entrypoint TEXT,
      effort TEXT,
      provider TEXT DEFAULT 'claude-code'
    );

    CREATE TABLE IF NOT EXISTS ingest_state (
      file_path TEXT PRIMARY KEY,
      file_size INTEGER,
      last_modified INTEGER,
      bytes_read INTEGER
    );
  `);
}

/**
 * Schema migrations for existing databases created before the provider column
 * was added. Safely ignored if columns already exist.
 */
function runMigrations() {
  let migrated = false;

  // v1.1: add provider column to pre-existing databases
  try {
    const messagesCols = db.prepare("PRAGMA table_info(messages)").all();
    const hasProviderMsg = messagesCols.some(c => c.name === 'provider');
    if (!hasProviderMsg) {
      db.exec("ALTER TABLE messages ADD COLUMN provider TEXT DEFAULT 'claude-code'");
      console.log("Migration: added provider column to messages");
      migrated = true;
    }
  } catch (e) { /* skip on error */ }

  try {
    const sessionCols = db.prepare("PRAGMA table_info(sessions)").all();
    const hasProviderSess = sessionCols.some(c => c.name === 'provider');
    if (!hasProviderSess) {
      db.exec("ALTER TABLE sessions ADD COLUMN provider TEXT DEFAULT 'claude-code'");
      console.log("Migration: added provider column to sessions");
      migrated = true;
    }
  } catch (e) { /* skip on error */ }

  // Indexes that depend on the provider column — safe to create only after
  // the migration above has added the column.
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_messages_provider ON messages(provider)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider)");
  } catch (e) { /* skip on error */ }

  // v1.1 backfill: re-attribute rows to the correct provider based on source
  // file path. Runs once after the migration; idempotent for fresh databases.
  if (migrated) {
    try {
      const info = db.prepare(`
        UPDATE messages
        SET provider = 'cowork'
        WHERE source_file LIKE '%local-agent-mode-sessions%'
          AND provider = 'claude-code'
      `).run();
      if (info.changes > 0) {
        console.log(`Migration: backfilled ${info.changes} messages to provider=cowork`);
      }
    } catch (e) { /* skip on error */ }

    try {
      db.exec(`
        UPDATE sessions
        SET provider = (
          SELECT DISTINCT provider FROM messages WHERE messages.session_id = sessions.session_id LIMIT 1
        )
        WHERE provider = 'claude-code'
          AND session_id IN (SELECT session_id FROM messages WHERE provider != 'claude-code')
      `);
    } catch (e) { /* skip on error */ }
  }
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

function getDataDir() {
  return DATA_DIR;
}

module.exports = { getDb, closeDb, setDataDir, getDataDir };
Object.defineProperty(module.exports, 'DB_PATH', {
  get() { return DB_PATH; },
});
