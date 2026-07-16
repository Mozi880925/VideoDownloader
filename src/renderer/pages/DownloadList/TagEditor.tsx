import React, { useState, useRef, useEffect } from 'react'
import { Space, Tag, Input } from 'antd'
import type { InputRef } from 'antd'
import { TagOutlined, PlusOutlined } from '@ant-design/icons'

// ---- 标签编辑器 ----

const TagEditor: React.FC<{
  tags: string[]
  onChange: (tags: string[]) => void
  onClickTag?: (tag: string) => void
}> = ({ tags, onChange, onClickTag }) => {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<InputRef>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const handleConfirm = () => {
    const v = inputValue.trim()
    if (v && !tags.includes(v)) {
      onChange([...tags, v])
    }
    setInputValue('')
    setEditing(false)
  }

  const handleRemove = (tag: string) => {
    onChange(tags.filter((t) => t !== tag))
  }

  return (
    <Space size={[4, 4]} wrap style={{ maxWidth: '100%' }}>
      {tags.map((t) => (
        <Tag
          key={t}
          closable
          onClose={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handleRemove(t)
          }}
          onClick={() => onClickTag?.(t)}
          title={onClickTag ? `点击筛选"${t}"` : undefined}
          style={{
            fontSize: 11, margin: 0,
            background: '#e6f4ff', borderColor: '#91caff', color: '#1677ff',
            cursor: onClickTag ? 'pointer' : 'default',
          }}
        >
          <TagOutlined style={{ marginRight: 2 }} />
          {t}
        </Tag>
      ))}
      {editing ? (
        <Input
          ref={inputRef}
          size="small"
          type="text"
          style={{ width: 96, height: 22, fontSize: 11 }}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleConfirm}
          onPressEnter={handleConfirm}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setInputValue('')
              setEditing(false)
            }
          }}
          maxLength={20}
          placeholder="输入标签"
        />
      ) : (
        <Tag
          onClick={() => setEditing(true)}
          style={{
            fontSize: 11,
            margin: 0,
            background: '#fafafa',
            borderStyle: 'dashed',
            color: '#888',
            cursor: 'pointer',
          }}
        >
          <PlusOutlined style={{ fontSize: 10, marginRight: 2 }} />
          添加标签
        </Tag>
      )}
    </Space>
  )
}

export default TagEditor
