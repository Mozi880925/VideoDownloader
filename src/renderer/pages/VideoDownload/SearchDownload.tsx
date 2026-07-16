import React, { useState } from 'react'
import type { SearchResult } from '@shared/types'
import { Input, Button, Card, Row, Col, Select, Typography, message, Empty, Spin, Checkbox } from 'antd'
import { SearchOutlined, DownloadOutlined, ClockCircleOutlined, VideoCameraOutlined } from '@ant-design/icons'
import { useBatchStore } from '../../store/batchStore'

const { Text } = Typography

const SearchDownload: React.FC = () => {
  const [keyword, setKeyword] = useState('')
  const [limit, setLimit] = useState(20)
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set())

  const commitBatchUrls = useBatchStore((s) => s.commitBatchUrls)

  const handleSearch = async () => {
    if (!keyword.trim()) {
      message.warning('请输入搜索关键词')
      return
    }
    setIsSearching(true)
    setResults([])
    setSelectedUrls(new Set())
    const result = await window.api.searchVideos(keyword.trim(), limit).catch(() => null)
    if (result?.status === 'success' && result.data) {
      setResults(result.data)
      if (result.data.length === 0) message.info('未找到相关视频')
      else message.success(`成功搜到 ${result.data.length} 条素材`)
    } else if (result?.status === 'cookie_error') {
      message.error(result.errorMessage || 'Cookie读取失败，请确认 Chrome 已安装且未锁定')
    } else if (result && result.status !== 'cancelled') {
      message.error(result.errorMessage || '搜索失败')
    } else if (!result) {
      message.error('搜索请求失败，请重试')
    }
    setIsSearching(false)
  }

  const handleSelect = (url: string, checked: boolean) => {
    setSelectedUrls(prev => {
      const next = new Set(prev)
      if (checked) next.add(url)
      else next.delete(url)
      return next
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedUrls(new Set(results.map(r => r.url)))
    } else {
      setSelectedUrls(new Set())
    }
  }

  const commitToBatch = () => {
    if (selectedUrls.size === 0) {
      message.warning('请至少选择一个视频')
      return
    }
    commitBatchUrls(Array.from(selectedUrls))
    // 触发批量下载切页在 App.tsx 中完成
  }

  const formatDuration = (sec?: number) => {
    if (!sec) return ''
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const formatViewCount = (count?: number) => {
    if (!count) return null
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
    if (count >= 10000) return `${(count / 10000).toFixed(1)}万`
    return count.toString()
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr || dateStr.length !== 8) return null
    return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`
  }

  return (
    <div style={{ position: 'relative', paddingBottom: 60, minHeight: '100%' }}>
      {/* 搜索控制区 */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 12 }}>
        <Input
          size="large"
          placeholder="例如：funny cat shorts"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={handleSearch}
          prefix={<SearchOutlined style={{ color: '#ccc' }} />}
          style={{ flex: 1 }}
          disabled={isSearching}
        />
        <Select
          size="large"
          value={limit}
          onChange={setLimit}
          options={[
            { label: '拉取 10 条', value: 10 },
            { label: '拉取 20 条', value: 20 },
            { label: '拉取 50 条', value: 50 },
          ]}
          disabled={isSearching}
          style={{ width: 120 }}
        />
        <Button
          type="primary"
          size="large"
          icon={<SearchOutlined />}
          onClick={handleSearch}
          loading={isSearching}
          style={{ width: 120 }}
        >
          {isSearching ? '搜索中' : '搜索'}
        </Button>
      </div>

      {/* 搜索结果区 */}
      {isSearching ? (
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
          <Spin size="large" tip="正在通过 yt-dlp 快速搜刮素材..." />
        </div>
      ) : results.length > 0 ? (
        <Row gutter={[16, 16]}>
          {results.map((item) => {
            const isSelected = selectedUrls.has(item.url)
            return (
              <Col span={8} key={item.id}>
                <Card
                  hoverable
                  bodyStyle={{ padding: 12, position: 'relative' }}
                  onClick={() => handleSelect(item.url, !isSelected)}
                  style={{
                    height: '100%',
                    borderColor: isSelected ? '#1677ff' : '#f0f0f0',
                    borderWidth: isSelected ? 2 : 1,
                  }}
                >
                  {/* 角落复选框 */}
                  <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}>
                    <Checkbox
                      checked={isSelected}
                      // 阻止事件冒泡防止双击
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleSelect(item.url, e.target.checked)}
                    />
                  </div>

                  <div
                    style={{
                      height: 120,
                      background: '#f0f0f0',
                      borderRadius: 4,
                      marginBottom: 8,
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative'
                    }}
                  >
                    {item.thumbnail ? (
                      <img src={item.thumbnail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="thumb" />
                    ) : (
                      <VideoCameraOutlined style={{ fontSize: 24, color: '#ccc' }} />
                    )}
                    {/* 时长 */}
                    {item.duration && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 4,
                          right: 4,
                          background: 'rgba(0,0,0,0.7)',
                          color: '#fff',
                          padding: '1px 4px',
                          borderRadius: 2,
                          fontSize: 11,
                        }}
                      >
                        {formatDuration(item.duration)}
                      </div>
                    )}
                  </div>
                  <Text strong ellipsis={{ tooltip: item.title }} style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
                    {item.title}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 0 }}>
                    {item.author || item.id}
                  </Text>
                  <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#999', marginTop: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {formatViewCount(item.viewCount) && <span>播放量：{formatViewCount(item.viewCount)}</span>}
                    {formatDate(item.uploadDate) && <span>发布时间：{formatDate(item.uploadDate)}</span>}
                  </div>
                </Card>
              </Col>
            )
          })}
        </Row>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="输入关键词（如 funny pets短视频）快速搜刮素材"
          style={{ padding: '80px 0' }}
        />
      )}

      {/* 底部悬浮控制台 */}
      {results.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 60,
            background: '#fff',
            borderTop: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            borderRadius: 8,
            boxShadow: '0 -2px 8px rgba(0,0,0,0.05)',
          }}
        >
          <div>
            <Checkbox
              checked={selectedUrls.size === results.length && results.length > 0}
              indeterminate={selectedUrls.size > 0 && selectedUrls.size < results.length}
              onChange={(e) => handleSelectAll(e.target.checked)}
            >
              全选
            </Checkbox>
            <Text type="secondary" style={{ marginLeft: 16 }}>
              已选择 <span style={{ color: '#1677ff', fontWeight: 600 }}>{selectedUrls.size}</span> 个素材
            </Text>
          </div>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            size="large"
            disabled={selectedUrls.size === 0}
            onClick={commitToBatch}
            style={{ fontWeight: 600, background: 'linear-gradient(90deg, #1677ff, #4096ff)', border: 'none' }}
          >
            一键加入批量下载
          </Button>
        </div>
      )}
    </div>
  )
}

export default SearchDownload
