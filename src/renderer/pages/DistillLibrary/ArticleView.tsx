import React, { useEffect, useState } from 'react'
import { App, Button, Drawer, Space, Spin, Tag } from 'antd'
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons'
import type { DistilledArticle } from '@shared/types'
import MarkdownLite from '../../components/MarkdownLite'
import { SOURCE_TYPE_LABEL, exportArticleMarkdown } from './shared'

// ────────── 提纯稿查看抽屉 ──────────

interface Props {
  articleId: string | null   // null = 关闭
  onClose: () => void
}

const ArticleView: React.FC<Props> = ({ articleId, onClose }) => {
  const { message } = App.useApp()
  const [article, setArticle] = useState<DistilledArticle | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!articleId) { setArticle(null); return }
    setLoading(true)
    window.api.distillGet(articleId)
      .then(setArticle)
      .catch(() => message.error('读取提纯稿失败'))
      .finally(() => setLoading(false))
  }, [articleId, message])

  const copyAll = async () => {
    if (!article?.markdown) return
    await navigator.clipboard.writeText(article.markdown)
    message.success('已复制 Markdown 全文')
  }

  const handleExport = async () => {
    if (!article) return
    const saved = await exportArticleMarkdown(article.id, article.title)
    if (saved) message.success(`已导出：${saved}`)
  }

  return (
    <Drawer
      open={!!articleId}
      onClose={onClose}
      width={760}
      title={article?.title || '提纯稿'}
      extra={
        <Space>
          <Button size="small" icon={<CopyOutlined />} onClick={copyAll} disabled={!article?.markdown}>
            复制全文
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={handleExport} disabled={!article?.markdown}>
            导出 MD
          </Button>
        </Space>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      ) : article ? (
        <>
          <Space size={8} style={{ marginBottom: 16 }}>
            <Tag>{SOURCE_TYPE_LABEL[article.sourceType]}</Tag>
            <span style={{ fontSize: 12, color: '#999' }}>
              原文 {article.sourceCharCount.toLocaleString()} 字 → 提纯稿 {article.markdown.length.toLocaleString()} 字
              · {article.model} · 耗时 {Math.round(article.durationMs / 1000)}s
            </span>
          </Space>
          <MarkdownLite markdown={article.markdown} />
        </>
      ) : null}
    </Drawer>
  )
}

export default ArticleView
