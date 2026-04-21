import React, { useEffect } from 'react'
import { Card, Form, Select, Switch, Button, message, Input } from 'antd'
import { FolderOpenOutlined, FileTextOutlined, SafetyCertificateOutlined, LoginOutlined } from '@ant-design/icons'
import { useDownloadStore } from '../../store/downloadStore'

const Settings: React.FC = () => {
  const [form] = Form.useForm()
  const appSettings = useDownloadStore(s => s.appSettings)
  const updateSettings = useDownloadStore(s => s.updateSettings)

  useEffect(() => {
    form.setFieldsValue(appSettings)
  }, [appSettings, form])

  // 登录窗口关闭后，主进程推送新的 cookies 路径
  useEffect(() => {
    const removeListener = window.api.onCookiesPathUpdated((newPath) => {
      form.setFieldsValue({ cookiesPath: newPath })
      updateSettings({ cookiesPath: newPath })
      message.success('登录完成，Cookie 已自动保存')
    })
    return () => removeListener()
  }, [form, updateSettings])

  const handleValuesChange = () => {
    const values = form.getFieldsValue()
    updateSettings(values)
    window.api.setCookiesPath(values.cookiesPath || '').catch(() => {})
    message.success('设置已保存')
  }

  const handleSelectPath = async () => {
    const defaultPath = form.getFieldValue('downloadPath') || await window.api.getDownloadsPath()
    const path = await window.api.selectDirectory(defaultPath)
    if (path) {
      form.setFieldsValue({ downloadPath: path })
      updateSettings({ ...appSettings, downloadPath: path })
    }
  }

  const handleSelectCookiesFile = async () => {
    const filePath = await window.api.selectFile([{ name: 'Cookies 文件', extensions: ['txt'] }])
    if (filePath) {
      form.setFieldsValue({ cookiesPath: filePath })
      updateSettings({ ...appSettings, cookiesPath: filePath })
      window.api.setCookiesPath(filePath).catch(() => {})
    }
  }

  const handleLoginYouTube = async () => {
    message.info('请在弹出窗口中完成登录，关闭窗口后 Cookie 将自动保存')
    await window.api.openLoginWindow().catch(() => {})
  }

  const handleOpenLogs = async () => {
    await window.api.openLogsFolder()
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, background: 'linear-gradient(90deg, #1677ff, #4096ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 24 }}>
        设置
      </h2>

      <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <Form
          form={form}
          layout="vertical"
          onValuesChange={handleValuesChange}
        >
          <Form.Item label="默认下载路径" extra="留空时，将默认下载到操作系统的【下载】文件夹中。">
            <div style={{ display: 'flex', gap: 8 }}>
              <Form.Item name="downloadPath" noStyle>
                <Input readOnly placeholder="使用系统默认下载文件夹..." />
              </Form.Item>
              <Button icon={<FolderOpenOutlined />} onClick={handleSelectPath}>选择目录</Button>
            </div>
          </Form.Item>

          <Form.Item
            label="Cookie 文件"
            extra="用于下载需要登录的内容（如会员视频）。可点击「登录 YouTube」在应用内登录自动生成，或手动选择 cookies.txt 文件。留空则以游客身份下载。"
          >
            <div style={{ display: 'flex', gap: 8 }}>
              <Form.Item name="cookiesPath" noStyle>
                <Input readOnly placeholder="未选择，将以游客身份下载..." />
              </Form.Item>
              <Button icon={<SafetyCertificateOutlined />} onClick={handleSelectCookiesFile}>选择文件</Button>
              <Button type="primary" icon={<LoginOutlined />} onClick={handleLoginYouTube}>登录 YouTube</Button>
            </div>
          </Form.Item>

          <Form.Item label="默认视频清晰度" name="defaultFormat">
            <Select>
              <Select.Option value="best">最佳质量（自动选择，支持合并）</Select.Option>
              <Select.Option value="best[ext=mp4]/b">最佳质量（仅限原生 MP4）</Select.Option>
              <Select.Option value="bestvideo[height<=1080]+bestaudio/best[height<=1080]">最高 1080p</Select.Option>
              <Select.Option value="bestvideo[height<=720]+bestaudio/best[height<=720]">最高 720p</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="默认文件命名规则" name="namingRule" extra="决定下载保存的文件名格式。">
            <Select>
              <Select.Option value="%(extractor_key)s_%(uploader,creator,channel)s_%(title).50s_%(upload_date>%Y%m%d)s.%(ext)s">平台_作者_标题_日期</Select.Option>
              <Select.Option value="%(title).100s.%(ext)s">纯标题 (推荐)</Select.Option>
              <Select.Option value="%(extractor_key)s_%(upload_date>%Y%m%d)s_%(title).50s.%(ext)s">平台_日期_标题</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="下载完成系统通知" name="enableNotification" valuePropName="checked">
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
        </Form>
      </Card>

      <Card bordered={false} style={{ marginTop: 24, borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <h3 style={{ marginBottom: 16 }}>系统日志</h3>
        <p style={{ color: '#666', marginBottom: 16 }}>
          如果遇到下载出错或无法解析，可以查看日志文件中 yt-dlp 的原生报错信息。
        </p>
        <Button icon={<FileTextOutlined />} onClick={handleOpenLogs}>
          打开日志文件夹
        </Button>
      </Card>
    </div>
  )
}

export default Settings
