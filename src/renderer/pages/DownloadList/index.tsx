import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Segmented, message } from 'antd'
import PageTitle from '../../components/PageTitle'
import TranscribeModal from '../../components/TranscribeModal'
import { useActiveTasksStore } from '../../store/activeTasksStore'
import { useHistoryStore } from '../../store/historyStore'
import { useBatchStore } from '../../store/batchStore'
import { useFilterStore, matchesFilter } from './filterStore'
import { useSelection } from './useSelection'
import { exportRecords } from './csv'
import { EmptyState } from './shared'
import ActiveTaskCard from './ActiveTaskCard'
import CompletedRecordCard from './CompletedRecordCard'
import FailedRecordCard from './FailedRecordCard'
import FilterBar from './FilterBar'
import BatchActionBar from './BatchActionBar'

// ---- 主页面（编排层：筛选派生 + 多选 + 批量操作 + Tab 切换）----

type TabKey = 'active' | 'completed' | 'failed'

const DownloadList: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('active')
  const activeTasks = useActiveTasksStore((s) => s.activeTasks)
  const completedRecords = useHistoryStore((s) => s.completedRecords)
  const failedRecords = useHistoryStore((s) => s.failedRecords)
  const filterKeyword = useFilterStore((s) => s.filterKeyword)
  const filterPlatform = useFilterStore((s) => s.filterPlatform)
  const filterDateRange = useFilterStore((s) => s.filterDateRange)
  const removeRecord = useHistoryStore((s) => s.removeRecord)
  const removeFailedRecord = useHistoryStore((s) => s.removeFailedRecord)
  const clearAllCompleted = useHistoryStore((s) => s.clearAllCompleted)
  const clearAllFailed = useHistoryStore((s) => s.clearAllFailed)
  const commitBatchUrls = useBatchStore((s) => s.commitBatchUrls)

  const hasFilter = !!filterKeyword || !!filterPlatform || !!filterDateRange

  // 派生筛选结果
  const filteredActive = useMemo(
    () => activeTasks.filter((t) => matchesFilter({ ...t, ts: t.startedAt }, filterKeyword, filterPlatform, null)),
    [activeTasks, filterKeyword, filterPlatform],
  )
  const filteredCompleted = useMemo(
    () => completedRecords.filter((r) => matchesFilter({ ...r, ts: r.completedAt }, filterKeyword, filterPlatform, filterDateRange)),
    [completedRecords, filterKeyword, filterPlatform, filterDateRange],
  )
  const filteredFailed = useMemo(
    () => failedRecords.filter((r) => matchesFilter({ ...r, ts: r.failedAt }, filterKeyword, filterPlatform, filterDateRange)),
    [failedRecords, filterKeyword, filterPlatform, filterDateRange],
  )

  // 选择状态
  const completedIds = useMemo(() => filteredCompleted.map((r) => r.taskId), [filteredCompleted])
  const failedIds = useMemo(() => filteredFailed.map((r) => r.taskId), [filteredFailed])
  const completedSel = useSelection(completedIds)
  const failedSel = useSelection(failedIds)

  // 批量删除
  const handleDeleteSelectedCompleted = useCallback(() => {
    for (const id of completedSel.selected) {
      removeRecord(id)
    }
    completedSel.clear()
  }, [completedSel, removeRecord])

  const handleDeleteSelectedFailed = useCallback(() => {
    for (const id of failedSel.selected) {
      removeFailedRecord(id)
    }
    failedSel.clear()
  }, [failedSel, removeFailedRecord])

  const handleClearAllCompleted = useCallback(() => {
    clearAllCompleted()
    completedSel.clear()
  }, [clearAllCompleted, completedSel])

  const handleClearAllFailed = useCallback(() => {
    clearAllFailed()
    failedSel.clear()
  }, [clearAllFailed, failedSel])

  const handleRetrySelectedFailed = useCallback(() => {
    const urls = filteredFailed
      .filter((r) => failedSel.selected.has(r.taskId))
      .map((r) => r.url)
    if (urls.length > 0) commitBatchUrls(urls)
  }, [filteredFailed, failedSel.selected, commitBatchUrls])

  const handleRetryAllFailed = useCallback(() => {
    const urls = filteredFailed.map((r) => r.url)
    if (urls.length > 0) commitBatchUrls(urls)
  }, [filteredFailed, commitBatchUrls])

  // 文件存在性检测：仅检测尚未探测过的路径，避免每次 completedRecords 变化时全量重扫
  const [fileExists, setFileExists] = useState<Record<string, boolean>>({})
  const checkedPathsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const newPaths = completedRecords
      .map((r) => r.filepath)
      .filter((p): p is string => typeof p === 'string' && p.length > 0 && !checkedPathsRef.current.has(p))
    if (newPaths.length === 0) return
    newPaths.forEach((p) => checkedPathsRef.current.add(p))
    let cancelled = false
    window.api.checkPaths(newPaths).then((res) => {
      if (!cancelled && res) setFileExists((prev) => ({ ...prev, ...res }))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [completedRecords])

  const [localTranscribePath, setLocalTranscribePath] = useState<string | null>(null)
  const handleLocalTranscribe = async () => {
    const file = await window.api.selectFile([
      { name: '音频/视频文件', extensions: ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac', 'mp4', 'mkv', 'webm'] },
    ])
    if (file) setLocalTranscribePath(file)
  }

  const [exportMsgApi, exportCtxHolder] = message.useMessage()
  const handleExportCompleted = useCallback(
    (format: 'json' | 'csv', scope: 'selected' | 'all') => {
      const records =
        scope === 'selected'
          ? filteredCompleted.filter((r) => completedSel.selected.has(r.taskId))
          : filteredCompleted
      if (records.length === 0) {
        exportMsgApi.warning(scope === 'selected' ? '请先勾选要导出的记录' : '当前没有可导出的记录')
        return
      }
      try {
        exportRecords(records, format)
        exportMsgApi.success(`已导出 ${records.length} 条记录`)
      } catch (err) {
        exportMsgApi.error(`导出失败：${(err as Error).message}`)
      }
    },
    [filteredCompleted, completedSel.selected, exportMsgApi],
  )

  return (
    <div style={{ padding: 24 }}>
      {exportCtxHolder}
      {localTranscribePath && (
        <TranscribeModal
          open={true}
          videoPath={localTranscribePath}
          videoTitle={localTranscribePath.split(/[\\/]/).pop()}
          onClose={() => setLocalTranscribePath(null)}
        />
      )}
      {/* 标题 */}
      <PageTitle title="下载列表" subtitle="查看当前下载任务和历史下载记录" />

      {/* 搜索 + 平台筛选 */}
      <FilterBar />

      {/* Tab */}
      <div style={{ marginBottom: 20 }}>
        <Segmented
          options={[
            {
              label: `下载中${activeTasks.length ? ` (${hasFilter ? `${filteredActive.length}/` : ''}${activeTasks.length})` : ''}`,
              value: 'active',
            },
            {
              label: `已完成${completedRecords.length ? ` (${hasFilter ? `${filteredCompleted.length}/` : ''}${completedRecords.length})` : ''}`,
              value: 'completed',
            },
            {
              label: `失败${failedRecords.length ? ` (${hasFilter ? `${filteredFailed.length}/` : ''}${failedRecords.length})` : ''}`,
              value: 'failed',
            },
          ]}
          value={tab}
          onChange={(v) => setTab(v as TabKey)}
          style={{ borderRadius: 8 }}
          size="middle"
        />
      </div>

      {/* 下载中 */}
      {tab === 'active' && (
        <div>
          {filteredActive.length === 0 ? (
            <EmptyState description="当前没有正在下载的任务" hasFilter={hasFilter && activeTasks.length > 0} />
          ) : (
            filteredActive.map((task) => (
              <ActiveTaskCard key={task.taskId} task={task} />
            ))
          )}
        </div>
      )}

      {/* 已完成 */}
      {tab === 'completed' && (
        <div>
          <BatchActionBar
            selectedCount={completedSel.selected.size}
            totalCount={filteredCompleted.length}
            allSelected={completedSel.allSelected}
            onToggleAll={completedSel.toggleAll}
            onDeleteSelected={handleDeleteSelectedCompleted}
            onClearAll={handleClearAllCompleted}
            type="completed"
            onExport={handleExportCompleted}
            onLocalTranscribe={handleLocalTranscribe}
          />
          {filteredCompleted.length === 0 ? (
            <EmptyState description="留下你的第一个下载足迹吧" hasFilter={hasFilter && completedRecords.length > 0} />
          ) : (
            filteredCompleted.map((record) => (
              <CompletedRecordCard
                key={record.taskId}
                record={record}
                selected={completedSel.selected.has(record.taskId)}
                onToggle={completedSel.toggle}
                fileMissing={
                  record.filepath
                    ? fileExists[record.filepath] === false
                    : undefined
                }
              />
            ))
          )}
        </div>
      )}

      {/* 失败 */}
      {tab === 'failed' && (
        <div>
          <BatchActionBar
            selectedCount={failedSel.selected.size}
            totalCount={filteredFailed.length}
            allSelected={failedSel.allSelected}
            onToggleAll={failedSel.toggleAll}
            onDeleteSelected={handleDeleteSelectedFailed}
            onClearAll={handleClearAllFailed}
            type="failed"
            onRetrySelected={handleRetrySelectedFailed}
            onRetryAll={handleRetryAllFailed}
          />
          {filteredFailed.length === 0 ? (
            <EmptyState description="非常好，尚未有任务失败" hasFilter={hasFilter && failedRecords.length > 0} />
          ) : (
            filteredFailed.map((record) => (
              <FailedRecordCard
                key={record.taskId}
                record={record}
                selected={failedSel.selected.has(record.taskId)}
                onToggle={failedSel.toggle}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default DownloadList
