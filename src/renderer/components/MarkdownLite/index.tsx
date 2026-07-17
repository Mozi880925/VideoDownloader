import React from 'react'
import { TEXT_SECONDARY } from '../../theme/tokens'

// ────────── 极简 Markdown 渲染器（零依赖，输出 React 节点，无 innerHTML）──────────
// 只支持提纯稿实际使用的语法面：#/##/### 标题、**加粗**、- / 1. 列表、> 引用、段落。
// 超纲语法（表格/图片/代码块等）退化为普通段落文本。

/** 行内解析：**加粗**（其余原样输出） */
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const re = /\*\*([^*]+)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    nodes.push(<strong key={key++}>{m[1]}</strong>)
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

interface Block {
  type: 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'quote' | 'p'
  lines: string[]
}

/** 逐行扫描聚合为块（列表/引用连续行归为一块） */
function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = []
  const push = (type: Block['type'], line: string) => {
    const lastBlock = blocks[blocks.length - 1]
    if ((type === 'ul' || type === 'ol' || type === 'quote') && lastBlock?.type === type) {
      lastBlock.lines.push(line)
    } else {
      blocks.push({ type, lines: [line] })
    }
  }

  for (const raw of markdown.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('### ')) push('h3', line.slice(4))
    else if (line.startsWith('## ')) push('h2', line.slice(3))
    else if (line.startsWith('# ')) push('h1', line.slice(2))
    else if (/^[-*]\s+/.test(line)) push('ul', line.replace(/^[-*]\s+/, ''))
    else if (/^\d+[.、]\s+/.test(line)) push('ol', line.replace(/^\d+[.、]\s+/, ''))
    else if (line.startsWith('> ')) push('quote', line.slice(2))
    else push('p', line)
  }
  return blocks
}

const MarkdownLite: React.FC<{ markdown: string; style?: React.CSSProperties }> = ({ markdown, style }) => {
  const blocks = parseBlocks(markdown)
  return (
    <div style={{ fontSize: 14, lineHeight: 1.9, color: '#333', ...style }}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h1':
            return <h1 key={i} style={{ fontSize: 22, fontWeight: 700, margin: '24px 0 12px' }}>{renderInline(b.lines[0])}</h1>
          case 'h2':
            return <h2 key={i} style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 10px', paddingBottom: 6, borderBottom: '1px solid #f0f0f0' }}>{renderInline(b.lines[0])}</h2>
          case 'h3':
            return <h3 key={i} style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 8px' }}>{renderInline(b.lines[0])}</h3>
          case 'ul':
            return (
              <ul key={i} style={{ margin: '8px 0', paddingLeft: 22 }}>
                {b.lines.map((l, j) => <li key={j} style={{ marginBottom: 4 }}>{renderInline(l)}</li>)}
              </ul>
            )
          case 'ol':
            return (
              <ol key={i} style={{ margin: '8px 0', paddingLeft: 22 }}>
                {b.lines.map((l, j) => <li key={j} style={{ marginBottom: 4 }}>{renderInline(l)}</li>)}
              </ol>
            )
          case 'quote':
            return (
              <blockquote key={i} style={{ margin: '10px 0', padding: '6px 14px', borderLeft: '3px solid #d9d9d9', color: TEXT_SECONDARY, background: '#fafafa' }}>
                {b.lines.map((l, j) => <p key={j} style={{ margin: '4px 0' }}>{renderInline(l)}</p>)}
              </blockquote>
            )
          default:
            return <p key={i} style={{ margin: '10px 0' }}>{renderInline(b.lines[0])}</p>
        }
      })}
    </div>
  )
}

export default MarkdownLite
