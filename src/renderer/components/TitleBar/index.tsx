import React from 'react'

const TitleBar: React.FC = () => {
  return (
    <div
      style={{
        height: 38,
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        flexShrink: 0,
        borderBottom: '1px solid #f0f0f0',
        // @ts-ignore
        WebkitAppRegion: 'drag',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          // @ts-ignore
          WebkitAppRegion: 'no-drag',
        }}
      >
        <WinBtn
          onClick={() => window.electronAPI.minimize()}
          hoverBg="#e8e8e8"
          title="最小化"
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect width="10" height="1" fill="#333" />
          </svg>
        </WinBtn>
        <WinBtn
          onClick={() => window.electronAPI.maximize()}
          hoverBg="#e8e8e8"
          title="最大化"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="#333" strokeWidth="1" />
          </svg>
        </WinBtn>
        <WinBtn
          onClick={() => window.electronAPI.close()}
          hoverBg="#e81123"
          hoverColor="#fff"
          title="关闭"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="0" y1="0" x2="10" y2="10" stroke="#333" strokeWidth="1.2" />
            <line x1="10" y1="0" x2="0" y2="10" stroke="#333" strokeWidth="1.2" />
          </svg>
        </WinBtn>
      </div>
    </div>
  )
}

interface WinBtnProps {
  onClick: () => void
  hoverBg: string
  hoverColor?: string
  title: string
  children: React.ReactNode
}

const WinBtn: React.FC<WinBtnProps> = ({ onClick, hoverBg, hoverColor, title, children }) => {
  const [hovered, setHovered] = React.useState(false)

  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 46,
        height: 38,
        border: 'none',
        background: hovered ? hoverBg : 'transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.1s',
      }}
    >
      <span style={{ color: hovered && hoverColor ? hoverColor : undefined, display: 'flex' }}>
        {children}
      </span>
    </button>
  )
}

export default TitleBar
