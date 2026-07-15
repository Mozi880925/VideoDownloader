import { handle } from './typed'
import {
  getAllCompletedRecords,
  insertCompletedRecord,
  updateCompletedRecordTags,
  deleteCompletedRecord,
  clearAllCompletedRecords,
  getAllFailedRecords,
  insertFailedRecord,
  deleteFailedRecord,
  clearAllFailedRecords,
  listTopicIdeas,
  insertTopicIdea,
  updateTopicIdea,
  deleteTopicIdea,
  getVideoAnalysis,
  listVideoAnalysisKeys,
  computeGrowthStats,
} from '../services/db'
import type { TitleAnalysisResult, VideoAnalysisRecord, TopicIdea } from '../../shared/types'

export function registerDbHandlers(): void {
  // ---- 下载记录 ----
  handle('db:get-completed-records', () => {
    try {
      return getAllCompletedRecords()
    } catch (err) {
      console.error('[db] get completed records failed:', err)
      return []
    }
  })

  handle('db:insert-completed-record', (_event, record) => {
    try {
      insertCompletedRecord(record)
    } catch (err) {
      console.error('[db] insert completed record failed:', err)
    }
  })

  handle('db:delete-completed-record', (_event, id) => {
    try {
      deleteCompletedRecord(id)
    } catch (err) {
      console.error('[db] delete completed record failed:', err)
    }
  })

  handle('db:update-completed-record-tags', (_event, id, tags) => {
    try {
      updateCompletedRecordTags(id, tags)
    } catch (err) {
      console.error('[db] update record tags failed:', err)
    }
  })

  handle('db:get-failed-records', () => {
    try {
      return getAllFailedRecords()
    } catch (err) {
      console.error('[db] get failed records failed:', err)
      return []
    }
  })

  handle('db:insert-failed-record', (_event, record) => {
    try {
      insertFailedRecord(record)
    } catch (err) {
      console.error('[db] insert failed record failed:', err)
    }
  })

  handle('db:delete-failed-record', (_event, id) => {
    try {
      deleteFailedRecord(id)
    } catch (err) {
      console.error('[db] delete failed record failed:', err)
    }
  })

  handle('db:clear-all-completed', () => {
    try {
      return clearAllCompletedRecords()
    } catch (err) {
      console.error('[db] clear all completed failed:', err)
      return 0
    }
  })

  handle('db:clear-all-failed', () => {
    try {
      return clearAllFailedRecords()
    } catch (err) {
      console.error('[db] clear all failed failed:', err)
      return 0
    }
  })

  // ---- 播放量增速 ----
  handle('sub:growth', () => {
    try {
      return computeGrowthStats().map((r) => ({
        videoId: r.video_id,
        channelId: r.channel_id,
        growth24h: r.growth_24h,
      }))
    } catch {
      return []
    }
  })

  // ---- 视频拆解记录 ----
  handle('analysis:get', (_e, videoId, channelId): VideoAnalysisRecord | null => {
    try {
      const row = getVideoAnalysis(videoId, channelId)
      if (!row) return null
      let result: TitleAnalysisResult
      try {
        result = JSON.parse(row.result_json) as TitleAnalysisResult
      } catch {
        return null
      }
      return {
        videoId: row.video_id,
        channelId: row.channel_id,
        title: row.title,
        result,
        usedOpening: row.used_opening === 1,
        auto: row.auto === 1,
        createdAt: row.created_at,
      }
    } catch {
      return null
    }
  })

  handle('analysis:keys', () => {
    try {
      return listVideoAnalysisKeys().map((r) => ({ videoId: r.video_id, channelId: r.channel_id }))
    } catch {
      return []
    }
  })

  // ---- 选题灵感库 ----
  handle('topic:list', () => listTopicIdeas() as TopicIdea[])
  handle('topic:insert', (_e, row) => insertTopicIdea(row))
  handle('topic:update', (_e, id, fields) => updateTopicIdea(id, fields))
  handle('topic:delete', (_e, id) => deleteTopicIdea(id))
}
