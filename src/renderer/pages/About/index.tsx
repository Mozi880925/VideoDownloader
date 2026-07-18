import React, { useEffect, useState } from 'react'
import PageTitle from '../../components/PageTitle'
import { Card, Typography, Divider, Tag, List } from 'antd'
import { CheckCircleOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { PRIMARY } from '../../theme/tokens'

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

  const workflowSteps = [
    '发现赛道：蓝海雷达按关键词扫描，产出新锐频道榜单',
    '盯对标：榜单一键「加入对标」订阅，双栏跟踪频道最新视频',
    '拆爆款：播放量快照探测爆款，AI 拆解标题/频道打法',
    '挖内容：字幕提取 + Whisper 转录，AI 提纯为分享式原文',
    '沉淀选题：全链路「存为选题」，汇入选题灵感库排期',
  ]

  const changeLogs = [
    '新增：蓝海雷达关键词扫描 → 新锐频道榜单，支持一键加入对标订阅',
    '新增：AI 提纯整理（转录稿 → 分享式原文，分块 + 断点续跑）+ 飞书文档交付',
    '新增：订阅视频 / 提纯稿一键存为选题，沉淀到选题灵感库',
    '优化：字幕提取、AI 转录、提纯稿库合并为「字幕和转录」单页胶囊 Tab',
    '优化：转录任务队列迁移到模块级 store，切页/重试不再中断',
    '修复：中文路径下 yt-dlp 输出编码错乱导致的下载/转录找不到文件问题',
  ]

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <PageTitle title="关于" size={24} style={{ marginBottom: 24 }} />

      <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          {/* 这里可以使用自己的 Logo 图标，暂时用一个占位图标 */}
          <div style={{ fontSize: 64, color: PRIMARY, marginBottom: 16 }}>
            <img src="https://api.iconify.design/logos:youtube-icon.svg" alt="logo" width="64" style={{ filter: 'grayscale(1) brightness(1.2) sepia(1) hue-rotate(180deg) saturate(3)' }} />
          </div>
          <Title level={3} style={{ margin: 0 }}>VideoDownloader</Title>
          <Text type="secondary">版本 v1.0.0 · 发现蓝海赛道 · 对标研究 · 选题沉淀的个人工作台</Text>
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

        <Card type="inner" title="五步工作流" style={{ borderRadius: 8, marginBottom: 16 }}>
          <List
            size="small"
            dataSource={workflowSteps}
            renderItem={(item, idx) => (
              <List.Item style={{ border: 'none', padding: '4px 0' }}>
                <Tag color="blue">{idx + 1}</Tag>
                <Typography.Text>{item}</Typography.Text>
              </List.Item>
            )}
          />
        </Card>

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
