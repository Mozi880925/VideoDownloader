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
  tags: string        // 逗号分隔的标签字符串
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

export interface ChannelSubscriptionRow {
  id: string
  name: string
  url: string
  last_checked_at: number
  last_seen_ids: string      // JSON 字符串数组
  enabled: number            // 0 / 1
  created_at: number
  group_name: string         // 分组名（默认空 = 未分组）
  pinned: number             // 0 / 1
  new_count: number          // 派生字段（JOIN 得出），写表时不参与
}

export interface NewVideoRow {
  id: string
  channel_id: string
  title: string
  url: string
  thumbnail: string
  upload_date: string
  duration: number
  discovered_at: number
  status: string             // 'new' | 'dismissed'
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
      status TEXT NOT NULL DEFAULT 'completed',
      tags TEXT NOT NULL DEFAULT ''
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
    CREATE TABLE IF NOT EXISTS channel_subscriptions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      last_checked_at INTEGER NOT NULL DEFAULT 0,
      last_seen_ids TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT 0,
      group_name TEXT NOT NULL DEFAULT '',
      pinned INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS channel_new_videos (
      id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      thumbnail TEXT NOT NULL DEFAULT '',
      upload_date TEXT NOT NULL DEFAULT '',
      duration INTEGER NOT NULL DEFAULT 0,
      discovered_at INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'new',
      PRIMARY KEY (id, channel_id)
    );
    CREATE INDEX IF NOT EXISTS idx_new_videos_channel_status ON channel_new_videos(channel_id, status);
  `)

  // Migration: 为已存在的旧表补充 tags 列
  const existingCols = db
    .prepare(`PRAGMA table_info(completed_records)`)
    .all() as Array<{ name: string }>
  if (!existingCols.some((c) => c.name === 'tags')) {
    db.exec(`ALTER TABLE completed_records ADD COLUMN tags TEXT NOT NULL DEFAULT ''`)
    console.log('[db] migration: added `tags` column to completed_records')
  }

  // Migration: 为已存在的旧订阅表补充 group_name / pinned 列
  const subCols = db
    .prepare(`PRAGMA table_info(channel_subscriptions)`)
    .all() as Array<{ name: string }>
  if (!subCols.some((c) => c.name === 'group_name')) {
    db.exec(`ALTER TABLE channel_subscriptions ADD COLUMN group_name TEXT NOT NULL DEFAULT ''`)
    console.log('[db] migration: added `group_name` column to channel_subscriptions')
  }
  if (!subCols.some((c) => c.name === 'pinned')) {
    db.exec(`ALTER TABLE channel_subscriptions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`)
    console.log('[db] migration: added `pinned` column to channel_subscriptions')
  }

  console.log('[db] database initialized')
}

function ensureDb(): Database.Database {
  if (!db) throw new Error('[db] database not initialized — call initDb() first')
  return db
}

// ---- CRUD ----

export function insertCompletedRecord(record: CompletedRecordRow): void {
  const stmt = ensureDb().prepare(`
    INSERT OR REPLACE INTO completed_records (id, title, thumbnail, platform, url, filepath, completed_at, status, tags)
    VALUES (@id, @title, @thumbnail, @platform, @url, @filepath, @completed_at, @status, @tags)
  `)
  stmt.run({ ...record, tags: record.tags ?? '' })
  console.log('[db] inserted completed record:', record.id, record.title)
}

export function updateCompletedRecordTags(id: string, tags: string): void {
  ensureDb().prepare('UPDATE completed_records SET tags = ? WHERE id = ?').run(tags, id)
  console.log('[db] updated tags for record:', id, '→', tags)
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

// ---- 频道订阅 CRUD ----

export function listSubscriptions(): ChannelSubscriptionRow[] {
  const rows = ensureDb()
    .prepare(
      `SELECT s.id, s.name, s.url, s.last_checked_at, s.last_seen_ids, s.enabled, s.created_at,
              s.group_name, s.pinned,
              (SELECT COUNT(*) FROM channel_new_videos v WHERE v.channel_id = s.id AND v.status = 'new') AS new_count
       FROM channel_subscriptions s
       ORDER BY s.pinned DESC, s.group_name COLLATE NOCASE ASC, s.created_at DESC`,
    )
    .all() as ChannelSubscriptionRow[]
  return rows
}

export function getSubscription(id: string): ChannelSubscriptionRow | null {
  const row = ensureDb()
    .prepare(
      `SELECT s.id, s.name, s.url, s.last_checked_at, s.last_seen_ids, s.enabled, s.created_at,
              s.group_name, s.pinned,
              (SELECT COUNT(*) FROM channel_new_videos v WHERE v.channel_id = s.id AND v.status = 'new') AS new_count
       FROM channel_subscriptions s
       WHERE s.id = ?`,
    )
    .get(id) as ChannelSubscriptionRow | undefined
  return row ?? null
}

export function insertSubscription(row: Omit<ChannelSubscriptionRow, 'new_count'>): void {
  ensureDb()
    .prepare(
      `INSERT OR REPLACE INTO channel_subscriptions
        (id, name, url, last_checked_at, last_seen_ids, enabled, created_at, group_name, pinned)
       VALUES (@id, @name, @url, @last_checked_at, @last_seen_ids, @enabled, @created_at, @group_name, @pinned)`,
    )
    .run(row)
  console.log('[db] inserted subscription:', row.id, row.name, row.url)
}

export function updateSubscriptionGroup(id: string, groupName: string): void {
  ensureDb()
    .prepare('UPDATE channel_subscriptions SET group_name = ? WHERE id = ?')
    .run(groupName ?? '', id)
}

export function updateSubscriptionPinned(id: string, pinned: boolean): void {
  ensureDb()
    .prepare('UPDATE channel_subscriptions SET pinned = ? WHERE id = ?')
    .run(pinned ? 1 : 0, id)
}

export function updateSubscriptionCheckState(id: string, lastCheckedAt: number, lastSeenIds: string): void {
  ensureDb()
    .prepare('UPDATE channel_subscriptions SET last_checked_at = ?, last_seen_ids = ? WHERE id = ?')
    .run(lastCheckedAt, lastSeenIds, id)
}

export function updateSubscriptionEnabled(id: string, enabled: boolean): void {
  ensureDb()
    .prepare('UPDATE channel_subscriptions SET enabled = ? WHERE id = ?')
    .run(enabled ? 1 : 0, id)
}

export function deleteSubscription(id: string): void {
  const db = ensureDb()
  db.prepare('DELETE FROM channel_subscriptions WHERE id = ?').run(id)
  db.prepare('DELETE FROM channel_new_videos WHERE channel_id = ?').run(id)
  console.log('[db] deleted subscription:', id)
}

export function insertNewVideos(rows: NewVideoRow[]): number {
  if (rows.length === 0) return 0
  const stmt = ensureDb().prepare(
    `INSERT OR IGNORE INTO channel_new_videos
      (id, channel_id, title, url, thumbnail, upload_date, duration, discovered_at, status)
     VALUES (@id, @channel_id, @title, @url, @thumbnail, @upload_date, @duration, @discovered_at, @status)`,
  )
  const insertMany = ensureDb().transaction((items: NewVideoRow[]) => {
    let cnt = 0
    for (const r of items) { const info = stmt.run(r); cnt += info.changes }
    return cnt
  })
  return insertMany(rows)
}

export function listNewVideos(channelId?: string): NewVideoRow[] {
  const db = ensureDb()
  if (channelId) {
    return db
      .prepare("SELECT * FROM channel_new_videos WHERE channel_id = ? ORDER BY discovered_at DESC")
      .all(channelId) as NewVideoRow[]
  }
  return db
    .prepare("SELECT * FROM channel_new_videos ORDER BY discovered_at DESC")
    .all() as NewVideoRow[]
}

export function dismissNewVideo(videoId: string, channelId: string): void {
  ensureDb()
    .prepare("UPDATE channel_new_videos SET status = 'dismissed' WHERE id = ? AND channel_id = ?")
    .run(videoId, channelId)
}

export function clearNewVideos(channelId: string): number {
  const result = ensureDb()
    .prepare("UPDATE channel_new_videos SET status = 'dismissed' WHERE channel_id = ? AND status = 'new'")
    .run(channelId)
  return result.changes
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    console.log('[db] database closed')
  }
}
