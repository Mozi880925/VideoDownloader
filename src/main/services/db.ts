import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

// ---- 类型 ----

export interface CompletedRecordRow {
  id: string
  title: string
  thumbnail: string
  platform: string
  url: string
  filepath: string
  completed_at: number
  status: string
}

export interface FailedRecordRow {
  id: string
  title: string
  thumbnail: string
  platform: string
  url: string
  error_message: string
  failed_at: number
  status: string
}

// ---- 数据库初始化 ----

let db: Database.Database | null = null

function getDbPath(): string {
  // 开发环境放项目根目录，生产环境放 userData
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    return path.resolve(__dirname, '..', '..', '..', 'data.db')
  }
  return path.join(app.getPath('userData'), 'data.db')
}

export function initDb(): void {
  const dbPath = getDbPath()
  console.log('[db] opening database at:', dbPath)
  db = new Database(dbPath)

  // WAL 模式提升并发读写性能
  db.pragma('journal_mode = WAL')

  // 建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS completed_records (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      thumbnail TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      filepath TEXT NOT NULL DEFAULT '',
      completed_at INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed'
    );
    CREATE TABLE IF NOT EXISTS failed_records (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      thumbnail TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      error_message TEXT NOT NULL DEFAULT '',
      failed_at INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'failed'
    );
  `)

  console.log('[db] database initialized')
}

function ensureDb(): Database.Database {
  if (!db) throw new Error('[db] database not initialized — call initDb() first')
  return db
}

// ---- CRUD ----

export function insertCompletedRecord(record: CompletedRecordRow): void {
  const stmt = ensureDb().prepare(`
    INSERT OR REPLACE INTO completed_records (id, title, thumbnail, platform, url, filepath, completed_at, status)
    VALUES (@id, @title, @thumbnail, @platform, @url, @filepath, @completed_at, @status)
  `)
  stmt.run(record)
  console.log('[db] inserted completed record:', record.id, record.title)
}

export function getAllCompletedRecords(): CompletedRecordRow[] {
  const rows = ensureDb().prepare(
    'SELECT * FROM completed_records ORDER BY completed_at DESC'
  ).all() as CompletedRecordRow[]
  console.log('[db] loaded', rows.length, 'completed records')
  return rows
}

export function deleteCompletedRecord(id: string): void {
  ensureDb().prepare('DELETE FROM completed_records WHERE id = ?').run(id)
  console.log('[db] deleted completed record:', id)
}

// ---- Failed records CRUD ----

export function insertFailedRecord(record: FailedRecordRow): void {
  const stmt = ensureDb().prepare(`
    INSERT OR REPLACE INTO failed_records (id, title, thumbnail, platform, url, error_message, failed_at, status)
    VALUES (@id, @title, @thumbnail, @platform, @url, @error_message, @failed_at, @status)
  `)
  stmt.run(record)
  console.log('[db] inserted failed record:', record.id, record.title)
}

export function getAllFailedRecords(): FailedRecordRow[] {
  const rows = ensureDb().prepare(
    'SELECT * FROM failed_records ORDER BY failed_at DESC'
  ).all() as FailedRecordRow[]
  console.log('[db] loaded', rows.length, 'failed records')
  return rows
}

export function deleteFailedRecord(id: string): void {
  ensureDb().prepare('DELETE FROM failed_records WHERE id = ?').run(id)
  console.log('[db] deleted failed record:', id)
}

export function clearAllCompletedRecords(): number {
  const result = ensureDb().prepare('DELETE FROM completed_records').run()
  console.log('[db] cleared all completed records, count:', result.changes)
  return result.changes
}

export function clearAllFailedRecords(): number {
  const result = ensureDb().prepare('DELETE FROM failed_records').run()
  console.log('[db] cleared all failed records, count:', result.changes)
  return result.changes
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    console.log('[db] database closed')
  }
}
