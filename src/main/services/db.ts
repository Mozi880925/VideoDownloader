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
  view_count: number
  discovered_at: number
  status: string             // 'new' | 'dismissed' | 'seen'
}

export interface VideoAnalysisRow {
  video_id: string
  channel_id: string
  title: string
  result_json: string
  used_opening: number
  auto: number
  created_at: number
}

export interface VideoTranscriptRow {
  video_id: string
  channel_id: string
  url: string
  title: string
  language: string
  srt: string
  text: string
  created_at: number
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
    CREATE TABLE IF NOT EXISTS topic_ideas (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      ref_url TEXT NOT NULL DEFAULT '',
      ref_title TEXT NOT NULL DEFAULT '',
      ref_thumbnail TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS video_transcripts (
      video_id TEXT NOT NULL,
      channel_id TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      language TEXT NOT NULL DEFAULT '',
      srt TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (video_id, channel_id)
    );
    CREATE TABLE IF NOT EXISTS video_analyses (
      video_id TEXT NOT NULL,
      channel_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      result_json TEXT NOT NULL DEFAULT '',
      used_opening INTEGER NOT NULL DEFAULT 0,
      auto INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (video_id, channel_id)
    );
    CREATE TABLE IF NOT EXISTS view_snapshots (
      video_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      view_count INTEGER NOT NULL DEFAULT 0,
      captured_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_video ON view_snapshots(channel_id, video_id, captured_at);
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

  // Migration: 为 channel_new_videos 补充 view_count 列
  const vidCols = db
    .prepare(`PRAGMA table_info(channel_new_videos)`)
    .all() as Array<{ name: string }>
  if (!vidCols.some((c) => c.name === 'view_count')) {
    db.exec(`ALTER TABLE channel_new_videos ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0`)
    console.log('[db] migration: added `view_count` column to channel_new_videos')
  }

  // Cleanup: 订阅频道根 URL 时曾把页签播放列表（"xxx - Videos/Shorts"）误存为视频，清掉这类假条目
  const tabCleanup = db
    .prepare(`DELETE FROM channel_new_videos
              WHERE url LIKE '%youtube.com/%/videos'
                 OR url LIKE '%youtube.com/%/shorts'
                 OR url LIKE '%youtube.com/%/streams'
                 OR url LIKE '%youtube.com/%/playlists'`)
    .run()
  if (tabCleanup.changes > 0) {
    console.log(`[db] cleanup: removed ${tabCleanup.changes} channel-tab pseudo-video rows`)
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
  db.prepare('DELETE FROM video_transcripts WHERE channel_id = ?').run(id)
  db.prepare('DELETE FROM video_analyses WHERE channel_id = ?').run(id)
  db.prepare('DELETE FROM view_snapshots WHERE channel_id = ?').run(id)
  console.log('[db] deleted subscription:', id)
}

// ---- 视频 AI 拆解记录 ----

export function getVideoAnalysis(videoId: string, channelId: string): VideoAnalysisRow | undefined {
  return ensureDb()
    .prepare('SELECT * FROM video_analyses WHERE video_id = ? AND channel_id = ?')
    .get(videoId, channelId) as VideoAnalysisRow | undefined
}

export function upsertVideoAnalysis(row: VideoAnalysisRow): void {
  ensureDb().prepare(
    `INSERT INTO video_analyses (video_id, channel_id, title, result_json, used_opening, auto, created_at)
     VALUES (@video_id, @channel_id, @title, @result_json, @used_opening, @auto, @created_at)
     ON CONFLICT(video_id, channel_id) DO UPDATE SET
       title = excluded.title, result_json = excluded.result_json,
       used_opening = excluded.used_opening, auto = excluded.auto, created_at = excluded.created_at`,
  ).run(row)
}

/** 所有已拆解视频的键（渲染端打「已拆解」角标用） */
export function listVideoAnalysisKeys(): { video_id: string; channel_id: string }[] {
  return ensureDb()
    .prepare('SELECT video_id, channel_id FROM video_analyses')
    .all() as { video_id: string; channel_id: string }[]
}

// ---- 播放量快照（增速爆款探测用） ----

export function insertViewSnapshots(
  rows: { video_id: string; channel_id: string; view_count: number }[],
): void {
  if (rows.length === 0) return
  const db = ensureDb()
  const now = Date.now()
  // 同一视频 30 分钟内只留一个快照，避免连续手动检查刷出冗余数据
  const recent = db.prepare(
    `SELECT 1 FROM view_snapshots WHERE channel_id = ? AND video_id = ? AND captured_at > ? LIMIT 1`,
  )
  const ins = db.prepare(
    `INSERT INTO view_snapshots (video_id, channel_id, view_count, captured_at) VALUES (?, ?, ?, ?)`,
  )
  const tx = db.transaction(() => {
    for (const r of rows) {
      if (r.view_count <= 0) continue
      if (recent.get(r.channel_id, r.video_id, now - 30 * 60_000)) continue
      ins.run(r.video_id, r.channel_id, r.view_count, now)
    }
  })
  tx()
}

/** 清理 30 天前的快照 */
export function pruneViewSnapshots(): void {
  ensureDb().prepare('DELETE FROM view_snapshots WHERE captured_at < ?').run(Date.now() - 30 * 86_400_000)
}

/**
 * 计算每个视频的 24 小时播放量增速：取最近 48h 内最早与最新两个快照的差值折算成日增。
 * 只有一个快照（刚开始监控）时无法计算，不返回该视频。
 */
export function computeGrowthStats(): { video_id: string; channel_id: string; growth_24h: number }[] {
  const since = Date.now() - 48 * 3_600_000
  const rows = ensureDb()
    .prepare(
      `SELECT video_id, channel_id,
              MIN(captured_at) AS t0, MAX(captured_at) AS t1
       FROM view_snapshots WHERE captured_at >= ?
       GROUP BY channel_id, video_id
       HAVING t1 > t0`,
    )
    .all(since) as { video_id: string; channel_id: string; t0: number; t1: number }[]

  const pick = ensureDb().prepare(
    `SELECT view_count FROM view_snapshots
     WHERE channel_id = ? AND video_id = ? AND captured_at = ?`,
  )
  const result: { video_id: string; channel_id: string; growth_24h: number }[] = []
  for (const r of rows) {
    const v0 = (pick.get(r.channel_id, r.video_id, r.t0) as { view_count: number } | undefined)?.view_count
    const v1 = (pick.get(r.channel_id, r.video_id, r.t1) as { view_count: number } | undefined)?.view_count
    if (v0 === undefined || v1 === undefined || v1 <= v0) continue
    const growth = ((v1 - v0) / (r.t1 - r.t0)) * 86_400_000
    result.push({ video_id: r.video_id, channel_id: r.channel_id, growth_24h: Math.round(growth) })
  }
  return result
}

// ---- 视频文案（字幕转录文本） ----

export function getVideoTranscript(videoId: string, channelId: string): VideoTranscriptRow | undefined {
  return ensureDb()
    .prepare('SELECT * FROM video_transcripts WHERE video_id = ? AND channel_id = ?')
    .get(videoId, channelId) as VideoTranscriptRow | undefined
}

export function upsertVideoTranscript(row: VideoTranscriptRow): void {
  ensureDb().prepare(
    `INSERT INTO video_transcripts (video_id, channel_id, url, title, language, srt, text, created_at)
     VALUES (@video_id, @channel_id, @url, @title, @language, @srt, @text, @created_at)
     ON CONFLICT(video_id, channel_id) DO UPDATE SET
       url = excluded.url, title = excluded.title, language = excluded.language,
       srt = excluded.srt, text = excluded.text, created_at = excluded.created_at`,
  ).run(row)
}

/**
 * 插入或刷新视频缓存（UPSERT）：
 * - 不存在的行：按传入 status 插入
 * - 已存在的行：只刷新元数据（标题/缩略图/日期/时长/播放量），不动 status 和 discovered_at
 *   播放量会随时间增长，每次检查都刷新，爆款探测才有意义；传入值为空/0 时保留旧值
 */
export function insertNewVideos(rows: NewVideoRow[]): number {
  if (rows.length === 0) return 0
  const stmt = ensureDb().prepare(
    `INSERT INTO channel_new_videos
      (id, channel_id, title, url, thumbnail, upload_date, duration, view_count, discovered_at, status)
     VALUES (@id, @channel_id, @title, @url, @thumbnail, @upload_date, @duration, @view_count, @discovered_at, @status)
     ON CONFLICT(id, channel_id) DO UPDATE SET
       title = CASE WHEN excluded.title <> '' THEN excluded.title ELSE channel_new_videos.title END,
       thumbnail = CASE WHEN excluded.thumbnail <> '' THEN excluded.thumbnail ELSE channel_new_videos.thumbnail END,
       upload_date = CASE WHEN excluded.upload_date <> '' THEN excluded.upload_date ELSE channel_new_videos.upload_date END,
       duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE channel_new_videos.duration END,
       view_count = CASE WHEN excluded.view_count > 0 THEN excluded.view_count ELSE channel_new_videos.view_count END`,
  )
  const upsertMany = ensureDb().transaction((items: NewVideoRow[]) => {
    let cnt = 0
    for (const r of items) { const info = stmt.run(r); cnt += info.changes }
    return cnt
  })
  return upsertMany(rows)
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

// ---- 选题灵感库 ----

export interface TopicIdeaRow {
  id: string
  title: string
  notes: string
  ref_url: string
  ref_title: string
  ref_thumbnail: string
  status: string  // 'pending' | 'planned' | 'filming' | 'published'
  created_at: number
  updated_at: number
}

export function listTopicIdeas(): TopicIdeaRow[] {
  return ensureDb().prepare('SELECT * FROM topic_ideas ORDER BY updated_at DESC').all() as TopicIdeaRow[]
}

export function insertTopicIdea(row: TopicIdeaRow): void {
  ensureDb().prepare(
    `INSERT INTO topic_ideas (id,title,notes,ref_url,ref_title,ref_thumbnail,status,created_at,updated_at)
     VALUES (@id,@title,@notes,@ref_url,@ref_title,@ref_thumbnail,@status,@created_at,@updated_at)`
  ).run(row)
}

export function updateTopicIdea(id: string, fields: Partial<Omit<TopicIdeaRow, 'id' | 'created_at'>>): void {
  const db = ensureDb()
  const now = Date.now()
  const sets = Object.keys(fields).map((k) => `${k} = @${k}`).join(', ')
  db.prepare(`UPDATE topic_ideas SET ${sets}, updated_at = ${now} WHERE id = @id`).run({ ...fields, id })
}

export function deleteTopicIdea(id: string): void {
  ensureDb().prepare('DELETE FROM topic_ideas WHERE id = ?').run(id)
}
