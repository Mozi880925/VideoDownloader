import React, { useEffect, useState } from 'react'
import PageTitle from '../../components/PageTitle'
import { Card, Typography, Divider, Tag, List } from 'antd'
import { CheckCircleOutlined, InfoCircleOutlined } from '@ant-design/icons'

const { Title, Paragraph, Text } = Typography

const About: React.FC = () => {
  const [ytdlpVersion, setYtdlpVersion] = useState<string>('检测中...')

  useEffect(() => {
    window.api.detectYtdlp().then((res) => {
      if (res.available) {
        setYtdlpVersion(res.version)
      } else {
        setYtdlpVersion('未检测到 yt-dlp')
      }
    })
  }, [])

  const changeLogs = [
    '新增：完整的设置界面支持 (默认下载格式、路径选取、命名规则等)',
    '新增：任务下载完成系统弹窗通知 (Windows 原生)',
    '优化：支持单视频下载页骨架屏过渡，避免布局跳跃',
    '优化：解析与连接阶段增加了 30 秒耐心阈值网络诊断',
    '优化：下载进度现在能够智能地根据流类型获取预估大小了',
    '修复：修正了限速参数配置问题导致无法下载的问题',
  ]

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <PageTitle title="关于" size={24} style={{ marginBottom: 24 }} />

      <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          {/* 这里可以使用自己的 Logo 图标，暂时用一个占位图标 */}
          <div style={{ fontSize: 64, color: '#1677ff', marginBottom: 16 }}>
            <img src="https://api.iconify.design/logos:youtube-icon.svg" alt="logo" width="64" style={{ filter: 'grayscale(1) brightness(1.2) sepia(1) hue-rotate(180deg) saturate(3)' }} />
          </div>
          <Title level={3} style={{ margin: 0 }}>VideoDownloader</Title>
          <Text type="secondary">版本 v1.0.0</Text>
        </div>

        <Divider />

        <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 24 }}>
          <div style={{ textAlign: 'center' }}>
            <Text type="secondary">核心引擎</Text>
            <div><Tag color="blue">yt-dlp</Tag> <Text code>{ytdlpVersion}</Text></div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Text type="secondary">前端栈</Text>
            <div><Tag color="cyan">React + Zustand</Tag> <Text code>v18.3</Text></div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Text type="secondary">后端服务</Text>
            <div><Tag color="geekblue">Electron + SQLite</Tag> <Text code>v33.2</Text></div>
          </div>
        </div>

        <Card type="inner" title={<><InfoCircleOutlined /> 最新更新 (Change Log)</>} style={{ borderRadius: 8 }}>
          <List
            size="small"
            dataSource={changeLogs}
            renderItem={(item) => (
              <List.Item style={{ border: 'none', padding: '4px 0' }}>
                <Typography.Text>
                  <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                  {item}
                </Typography.Text>
              </List.Item>
            )}
          />
        </Card>
      </Card>
    </div>
  )
}

export default About
