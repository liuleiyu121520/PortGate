/**
 * D-1 判据 A（方案 §11）：Electron 主进程内 better-sqlite3 真实读写 smoke。
 * 建内存库 → 建表 → 写入 → 读回校验。
 * better-sqlite3@13 为包内 N-API 通用预编译二进制（方案 §3.4），无 rebuild 环节；
 * 阶段 5 src/main/db/connection.ts 落地后，SQLite 访问收敛于该单点，本文件由其取代。
 */
import Database from 'better-sqlite3'

export interface SqliteSmokeResult {
  ok: boolean
  detail: string
}

const SMOKE_VALUE = 'portgate-d1a'

export function runSqliteSmoke(): SqliteSmokeResult {
  let db: Database.Database | null = null
  try {
    db = new Database(':memory:')
    db.exec('CREATE TABLE d1_smoke (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
    db.prepare('INSERT INTO d1_smoke (id, value) VALUES (1, ?)').run(SMOKE_VALUE)
    const row = db.prepare('SELECT value FROM d1_smoke WHERE id = 1').get() as
      | { value: string }
      | undefined
    const ok = row?.value === SMOKE_VALUE
    return {
      ok,
      detail: ok
        ? ':memory: 建表/写入/读回校验一致（包内 N-API 预编译在 Electron 运行时加载成功）'
        : `读回不一致: ${JSON.stringify(row)}`
    }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) }
  } finally {
    db?.close()
  }
}
