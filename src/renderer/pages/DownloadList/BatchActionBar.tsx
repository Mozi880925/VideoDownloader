import React from 'react'
import { Button, Popconfirm, Checkbox, Tooltip, Dropdown } from 'antd'
import {
  DeleteOutlined,
  ReloadOutlined,
  ClearOutlined,
  AudioOutlined,
  ExportOutlined,
} from '@ant-design/icons'

// ---- 批量操作栏 ----

interface BatchBarProps {
  selectedCount: number
  totalCount: number
  allSelected: boolean
  onToggleAll: () => void
  onDeleteSelected: () => void
  onClearAll: () => void
  type: 'completed' | 'failed'
  onRetrySelected?: () => void
  onRetryAll?: () => void
  onExport?: (format: 'json' | 'csv', scope: 'selected' | 'all') => void
  onLocalTranscribe?: () => void
}

const BatchActionBar: React.FC<BatchBarProps> = ({
  selectedCount, totalCount, allSelected,
  onToggleAll, onDeleteSelected, onClearAll, type,
  onRetrySelected, onRetryAll, onExport, onLocalTranscribe,
}) => {
  if (totalCount === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        marginBottom: 10,
        background: '#fafafa',
        borderRadius: 6,
        border: '1px solid #f0f0f0',
      }}
    >
      <Checkbox
        checked={allSelected && totalCount > 0}
        indeterminate={selectedCount > 0 && !allSelected}
        onChange={onToggleAll}
      >
        <span style={{ fontSize: 13, color: '#666' }}>
          {selectedCount > 0 ? `已选 ${selectedCount} 条` : '全选'}
        </span>
      </Checkbox>

      <div style={{ flex: 1 }} />

      {/* 已完成列表专属：导出 */}
      {type === 'completed' && onExport && (
        <Dropdown
          menu={{
            items: [
              { key: 'json-all', label: `导出全部 (${totalCount}) · JSON` },
              { key: 'csv-all', label: `导出全部 (${totalCount}) · CSV` },
              { type: 'divider' as const },
              {
                key: 'json-selected',
                label: `导出选中 (${selectedCount}) · JSON`,
                disabled: selectedCount === 0,
              },
              {
                key: 'csv-selected',
                label: `导出选中 (${selectedCount}) · CSV`,
                disabled: selectedCount === 0,
              },
            ],
            onClick: ({ key }) => {
              const [fmt, scope] = key.split('-') as ['json' | 'csv', 'selected' | 'all']
              onExport(fmt, scope)
            },
          }}
        >
          <Button size="small" icon={<ExportOutlined />}>
            导出
          </Button>
        </Dropdown>
      )}

      {/* 已完成列表专属：本地音频转写 */}
      {type === 'completed' && onLocalTranscribe && (
        <Tooltip title="选择本地音频文件（mp3/m4a/wav）进行 Whisper 转写">
          <Button size="small" icon={<AudioOutlined />} onClick={onLocalTranscribe}>
            本地音频转写
          </Button>
        </Tooltip>
      )}

      {/* 失败列表专属：重试按钮 */}
      {type === 'failed' && onRetrySelected && selectedCount > 0 && (
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={onRetrySelected}
          title="将选中的失败任务加入批量下载"
        >
          重试选中 ({selectedCount})
        </Button>
      )}
      {type === 'failed' && onRetryAll && (
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={onRetryAll}
          title="将全部失败任务加入批量下载"
        >
          全部重试 ({totalCount})
        </Button>
      )}

      {selectedCount > 0 && (
        <Popconfirm
          title={`确定删除选中的 ${selectedCount} 条记录？`}
          description={type === 'completed' ? '仅删除记录，不会删除已下载的文件' : undefined}
          onConfirm={onDeleteSelected}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
          >
            删除选中 ({selectedCount})
          </Button>
        </Popconfirm>
      )}

      <Popconfirm
        title={`确定清空全部 ${totalCount} 条${type === 'completed' ? '已完成' : '失败'}记录？`}
        description={type === 'completed' ? '仅删除记录，不会删除已下载的文件' : '此操作不可恢复'}
        onConfirm={onClearAll}
        okText="全部清空"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <Button
          size="small"
          icon={<ClearOutlined />}
        >
          清空全部
        </Button>
      </Popconfirm>
    </div>
  )
}

export default BatchActionBar
