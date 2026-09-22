/**
 * SQLite 连接与迁移（方案 §3.4/§5.14）：better-sqlite3 打开库文件 + WAL + 版本化迁移。
 * 取代阶段 1 的 db/smoke.ts（D-1A 冒烟程序退役；D-1 判据 B 由 tests/unit/sqlite-load.test.ts 承担）。
 * V1 仅建两表：port_session（DDL 逐字采用需求 §10.2）与 app_settings（方案 §5.14）；
 * favorite_port/ignore_rule/protection_rule 属 V1.1，届时以 migration 增加（R-06：不投机建表）。
 */
import Database from 'better-sqlite3'

export const DB_FILE_NAME = 'portgate.db'

/** 当前 schema 版本 */
export const SCHEMA_VERSION = 1

const PORT_SESSION_DDL = `CREATE TABLE IF NOT EXISTS port_session (
  id TEXT PRIMARY KEY,

  protocol TEXT NOT NULL,

  local_address TEXT NOT NULL,
  local_port INTEGER NOT NULL,

  remote_address TEXT,
  remote_port INTEGER,

  state TEXT,

  pid INTEGER NOT NULL,
  ppid INTEGER,

  process_name TEXT NOT NULL,
  executable_path TEXT,
  command_line TEXT,
  working_directory TEXT,

  user_name TEXT,

  application_name TEXT,
  application_path TEXT,

  project_name TEXT,
  project_path TEXT,

  container_name TEXT,
  docker_image TEXT,

  protection_level TEXT,

  process_started_at INTEGER,

  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  closed_at INTEGER
)`

const APP_SETTINGS_DDL = `CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
)`

/** 历史查询/收口热路径索引（不改变 §10.2 表定义，仅补索引） */
const INDEX_DDL = `CREATE INDEX IF NOT EXISTS idx_port_session_closed_at ON port_session (closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_port_session_port ON port_session (local_port)`

export function migrate(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number
  if (version < 1) {
    db.exec(PORT_SESSION_DDL)
    db.exec(APP_SETTINGS_DDL)
    db.exec(INDEX_DDL)
    db.pragma(`user_version = ${SCHEMA_VERSION}`)
  }
}

/** 打开库文件：启用 WAL + 迁移到最新版本 */
export function openDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  migrate(db)
  return db
}
