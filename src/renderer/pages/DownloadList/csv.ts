import type { CompletedRecord } from '@shared/types'

// ---- 下载记录导出工具 ----

function csvEscape(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function recordsToCsv(records: CompletedRecord[]): string {
  const header = ['taskId', 'title', 'platform', 'url', 'filepath', 'tags', 'completedAt']
  const rows = records.map((r) => [
    r.taskId,
    r.title,
    r.platform,
    r.url,
    r.filepath,
    (r.tags ?? []).join('|'),
    new Date(r.completedAt).toISOString(),
  ])
  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n')
}

function downloadBlob(content: string, filename: string, mime: string) {
  // CSV 加 UTF-8 BOM 让 Excel 直接打开不乱码
  const isCsv = mime.startsWith('text/csv')
  const blob = new Blob(isCsv ? ['﻿', content] : [content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportRecords(records: CompletedRecord[], format: 'json' | 'csv') {
  const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
  if (format === 'json') {
    downloadBlob(JSON.stringify(records, null, 2), `download-history-${ts}.json`, 'application/json')
  } else {
    downloadBlob(recordsToCsv(records), `download-history-${ts}.csv`, 'text/csv;charset=utf-8')
  }
}
