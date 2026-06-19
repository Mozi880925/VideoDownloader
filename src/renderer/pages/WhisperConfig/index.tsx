import React, { useEffect } from 'react'
import { Card, Form, Select, Button, Input, InputNumber, message } from 'antd'
import { FolderOpenOutlined, AudioOutlined } from '@ant-design/icons'
import { useSettingsStore } from '../../store/downloadStore'

const WhisperConfig: React.FC = () => {
  const [form] = Form.useForm()
  const appSettings = useSettingsStore(s => s.appSettings)
  const updateSettings = useSettingsStore(s => s.updateSettings)

  useEffect(() => {
    form.setFieldsValue(appSettings)
  }, [appSettings, form])

  const handleValuesChange = () => {
    const values = form.getFieldsValue()
    updateSettings(values)
    message.success('已保存')
  }

  const handleSelectExe = async () => {
    const filePath = await window.api.selectFile([
      { name: 'Whisper 可执行文件', extensions: ['exe'] },
      { name: '所有文件', extensions: ['*'] },
    ])
    if (filePath) {
      const current = form.getFieldValue('whisper') ?? {}
      form.setFieldsValue({ whisper: { ...current, executablePath: filePath } })
      updateSettings({ whisper: { ...appSettings.whisper!, ...current, executablePath: filePath } })
    }
  }

  const handleSelectModel = async () => {
    const filePath = await window.api.selectFile([
      { name: 'Whisper 模型（ggml-*.bin）', extensions: ['bin'] },
      { name: '所有文件', extensions: ['*'] },
    ])
    if (filePath) {
      const current = form.getFieldValue('whisper') ?? {}
      form.setFieldsValue({ whisper: { ...current, modelPath: filePath } })
      updateSettings({ whisper: { ...appSettings.whisper!, ...current, modelPath: filePath } })
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <h2 style={{
        fontSize: 24, fontWeight: 700,
        background: 'linear-gradient(90deg, #1677ff, #4096ff)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        marginBottom: 6,
      }}>
        Whisper 配置
      </h2>
      <p style={{ color: '#888', marginBottom: 24 }}>配置本地 Whisper 语音识别引擎，用于 AI 字幕生成</p>

      <Card
        bordered={false}
        style={{ borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
        title={<span><AudioOutlined style={{ marginRight: 6, color: '#1677ff' }} />Whisper 语音转写</span>}
      >
        <p style={{ color: '#666', marginBottom: 20, fontSize: 13 }}>
          配置 whisper.cpp 后，可以给没有字幕的视频自动生成字幕。需要先准备好可执行文件（whisper-cli.exe / main.exe）和模型文件（ggml-*.bin）。
        </p>

        <Form form={form} layout="vertical" onValuesChange={handleValuesChange}>
          <Form.Item label="可执行文件路径" extra="通常是 whisper-cli.exe 或旧版 main.exe">
            <div style={{ display: 'flex', gap: 8 }}>
              <Form.Item name={['whisper', 'executablePath']} noStyle>
                <Input readOnly placeholder="请选择 whisper-cli.exe / main.exe..." />
              </Form.Item>
              <Button icon={<FolderOpenOutlined />} onClick={handleSelectExe}>选择</Button>
            </div>
          </Form.Item>

          <Form.Item label="模型文件路径" extra="例如 ggml-base.bin / ggml-small.bin / ggml-medium.bin。模型越大越准、越慢。">
            <div style={{ display: 'flex', gap: 8 }}>
              <Form.Item name={['whisper', 'modelPath']} noStyle>
                <Input readOnly placeholder="请选择 ggml-*.bin 模型文件..." />
              </Form.Item>
              <Button icon={<FolderOpenOutlined />} onClick={handleSelectModel}>选择</Button>
            </div>
          </Form.Item>

          <Form.Item label="默认识别语言" name={['whisper', 'language']}>
            <Select
              options={[
                { value: 'auto', label: '自动检测' },
                { value: 'zh', label: '中文' },
                { value: 'en', label: '英文' },
                { value: 'ja', label: '日文' },
                { value: 'ko', label: '韩文' },
                { value: 'es', label: '西班牙文' },
                { value: 'fr', label: '法文' },
                { value: 'de', label: '德文' },
                { value: 'ru', label: '俄文' },
              ]}
            />
          </Form.Item>

          <Form.Item label="线程数" name={['whisper', 'threads']} extra="CPU 线程数，建议设为 CPU 核心数（1-32）">
            <InputNumber min={1} max={32} style={{ width: 120 }} />
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default WhisperConfig
