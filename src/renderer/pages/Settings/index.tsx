import React, { useEffect, useState } from 'react'
import PageTitle from '../../components/PageTitle'
import type { LlmConfig } from '@shared/types'
import { Card, Form, Select, Switch, Button, message, Input, InputNumber, Tag, Spin, Segmented, Divider } from 'antd'
import { FolderOpenOutlined, FileTextOutlined, SafetyCertificateOutlined, LoginOutlined, SyncOutlined, CheckCircleOutlined, RobotOutlined, ApiOutlined } from '@ant-design/icons'
import { useSettingsStore } from '../../store/settingsStore'

const SUB_LANG_OPTIONS = [
  { value: 'zh', label: '中文（zh）' },
  { value: 'zh-Hans', label: '简体中文（zh-Hans）' },
  { value: 'zh-Hant', label: '繁体中文（zh-Hant）' },
  { value: 'zh-CN', label: '中文简体-中国（zh-CN）' },
  { value: 'zh-TW', label: '中文繁体-台湾（zh-TW）' },
  { value: 'en', label: '英文（en）' },
  { value: 'en-US', label: '英文-美国（en-US）' },
  { value: 'ja', label: '日文（ja）' },
  { value: 'ko', label: '韩文（ko）' },
  { value: 'es', label: '西班牙文（es）' },
  { value: 'fr', label: '法文（fr）' },
  { value: 'de', label: '德文（de）' },
  { value: 'ru', label: '俄文（ru）' },
]

type SettingsModule = 'general' | 'subtitle' | 'cookie' | 'ai' | 'system'

const MODULE_OPTIONS: { label: string; value: SettingsModule }[] = [
  { label: '常规下载', value: 'general' },
  { label: '字幕设置', value: 'subtitle' },
  { label: '登录与 Cookie', value: 'cookie' },
  { label: 'AI 与数据源', value: 'ai' },
  { label: '系统', value: 'system' },
]

const cardStyle: React.CSSProperties = { borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }

const Settings: React.FC = () => {
  const [form] = Form.useForm()
  const appSettings = useSettingsStore(s => s.appSettings)
  const updateSettings = useSettingsStore(s => s.updateSettings)
  const [activeModule, setActiveModule] = useState<SettingsModule>('general')
  const [ytdlpInfo, setYtdlpInfo] = useState<{ available: boolean; version: string } | null>(null)
  const [ytdlpLoading, setYtdlpLoading] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateOutput, setUpdateOutput] = useState('')
  const [updateResult, setUpdateResult] = useState<'updated' | 'latest' | null>(null)
  const [llmTesting, setLlmTesting] = useState(false)
  const [llmTestResult, setLlmTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [ytApiTesting, setYtApiTesting] = useState(false)
  const [ytApiTestResult, setYtApiTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [ytQuota, setYtQuota] = useState<{ used: number; limit: number } | null>(null)

  // 切到「AI 与数据源」模块时拉取当日配额用量
  useEffect(() => {
    if (activeModule === 'ai') {
      window.api.ytApiGetQuota().then(setYtQuota).catch(() => {})
    }
  }, [activeModule])

  useEffect(() => {
    form.setFieldsValue(appSettings)
  }, [appSettings, form])

  useEffect(() => {
    setYtdlpLoading(true)
    window.api.detectYtdlp().then((info) => {
      setYtdlpInfo({ available: info.available, version: info.version })
    }).catch(() => {}).finally(() => setYtdlpLoading(false))
  }, [])

  const handleUpdateYtdlp = async () => {
    setUpdating(true)
    setUpdateOutput('')
    setUpdateResult(null)
    try {
      const result = await window.api.ytdlpUpdate()
      if (result.success) {
        const alreadyLatest = /is up to date/i.test(result.output)
        const info = await window.api.detectYtdlp()
        setYtdlpInfo({ available: info.available, version: info.version })
        if (alreadyLatest) {
          message.success(`已是最新版本${info.version ? ` (v${info.version})` : ''}`)
          setUpdateResult('latest')
        } else {
          message.success(`已更新到最新版${info.version ? ` v${info.version}` : ''}`)
          setUpdateResult('updated')
        }
        // 成功时清空黑色日志框，状态指示由小标签代替
        setUpdateOutput('')
        // 4 秒后淡出标签
        setTimeout(() => setUpdateResult(null), 4000)
      } else {
        // 失败时保留输出方便排查
        setUpdateOutput(result.output)
        message.warning('更新可能未成功，请查看输出')
      }
    } catch {
      message.error('更新失败')
    } finally {
      setUpdating(false)
    }
  }

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
    updateSettings(values)  // updateSettings 内部会全量同步到主进程
    // key 去重：文本输入逐字触发时不堆叠提示
    message.success({ content: '设置已保存', key: 'settings-saved' })
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
      updateSettings({ cookiesPath: filePath })
    }
  }

  const handleLoginYouTube = async () => {
    message.info('请在弹出窗口中完成登录，关闭窗口后 Cookie 将自动保存')
    await window.api.openLoginWindow().catch(() => {})
  }

  const handleSelectDomesticCookiesFile = async () => {
    const filePath = await window.api.selectFile([{ name: 'Cookies 文件', extensions: ['txt'] }])
    if (filePath) {
      form.setFieldsValue({ domesticCookiesPath: filePath })
      updateSettings({ domesticCookiesPath: filePath })
    }
  }

  const handleOpenLogs = async () => {
    await window.api.openLogsFolder()
  }

  const handleTestYtApi = async () => {
    const key = (form.getFieldValue('youtubeApiKey') as string | undefined)?.trim()
    if (!key) { message.warning('请先填写 API Key'); return }
    setYtApiTesting(true)
    setYtApiTestResult(null)
    try {
      const r = await window.api.ytApiTest(key)
      setYtApiTestResult(r)
      if (r.ok) message.success('连接成功')
    } finally {
      setYtApiTesting(false)
    }
  }

  const handleTestLlm = async () => {
    const llm = form.getFieldValue('llm') as LlmConfig | undefined
    if (!llm?.baseUrl?.trim() || !llm?.apiKey?.trim() || !llm?.model?.trim()) {
      message.warning('请先填写 Base URL、API Key 和模型名称')
      return
    }
    setLlmTesting(true)
    setLlmTestResult(null)
    try {
      const r = await window.api.llmTest(llm)
      setLlmTestResult(r)
      if (r.ok) message.success('连接成功')
    } finally {
      setLlmTesting(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 840, margin: '0 auto' }}>
      <PageTitle title="设置" size={24} style={{ marginBottom: 24 }} />

      <div style={{ marginBottom: 20 }}>
        <Segmented
          options={MODULE_OPTIONS}
          value={activeModule}
          onChange={(v) => setActiveModule(v as SettingsModule)}
          style={{ borderRadius: 8 }}
          size="middle"
        />
      </div>

      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
      >
        {activeModule === 'general' && (
          <Card bordered={false} style={cardStyle}>
            <Form.Item label="默认下载路径" extra="留空时，将默认下载到操作系统的【下载】文件夹中。">
              <div style={{ display: 'flex', gap: 8 }}>
                <Form.Item name="downloadPath" noStyle>
                  <Input readOnly placeholder="使用系统默认下载文件夹..." />
                </Form.Item>
                <Button icon={<FolderOpenOutlined />} onClick={handleSelectPath}>选择目录</Button>
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

            <Form.Item
              label="文件夹整理方式"
              name="folderOrganize"
              extra="控制视频文件在平台子目录下的进一步归档方式，使用 yt-dlp 模板变量动态创建子目录。"
            >
              <Select>
                <Select.Option value="none">不整理（所有文件放平台目录）</Select.Option>
                <Select.Option value="by-date">按月份归档（平台 / 2025-03 / 文件）</Select.Option>
                <Select.Option value="by-channel">按频道归档（平台 / 频道名 / 文件）</Select.Option>
                <Select.Option value="by-channel-date">按频道+月份（平台 / 频道名 / 2025-03 / 文件）</Select.Option>
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

            <Form.Item
              label="批量下载最大并发数"
              name="maxConcurrentDownloads"
              extra="同时进行的最大下载任务数。建议 2-3，过高会占用带宽或触发平台限流。"
            >
              <InputNumber min={1} max={5} step={1} style={{ width: 120 }} addonAfter="个" />
            </Form.Item>
          </Card>
        )}

        {activeModule === 'subtitle' && (
          <Card bordered={false} style={cardStyle}>
            <Form.Item
              label="默认下载字幕"
              name={['subtitles', 'enabled']}
              valuePropName="checked"
              extra="开启后，下载视频时会同时拉取字幕文件。单个视频下载时仍可临时取消。"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>

            <Form.Item
              label="字幕语言"
              name={['subtitles', 'languages']}
              extra="可多选。yt-dlp 会按顺序匹配，某视频没有对应语言则跳过。"
            >
              <Select
                mode="multiple"
                options={SUB_LANG_OPTIONS}
                placeholder="选择想要下载的字幕语言"
                allowClear
              />
            </Form.Item>

            <Form.Item
              label="包含自动字幕（YouTube 机翻）"
              name={['subtitles', 'includeAuto']}
              valuePropName="checked"
              extra="YouTube 对没有人工字幕的视频会自动生成机翻字幕，开启后也会下载这类字幕。"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>

            <Form.Item
              label="转为 .srt 格式"
              name={['subtitles', 'convertToSrt']}
              valuePropName="checked"
              extra="关闭则保留原始格式（通常是 .vtt）。"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>

            <Form.Item
              label="同时嵌入视频（软字幕轨道）"
              name={['subtitles', 'embed']}
              valuePropName="checked"
              extra="写入到 mp4/mkv 的字幕轨道，播放器可切换。与独立 .srt 不冲突。"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
          </Card>
        )}

        {activeModule === 'cookie' && (
          <Card bordered={false} style={cardStyle}>
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

            <Form.Item
              label="国内平台 Cookie 来源"
              name="douyinCookiesBrowser"
              extra="抖音、小红书需要 Cookie。优先使用下方独立 Cookies 文件（最稳定）；未配置时回退到浏览器读取。Chrome 运行时可能读 cookie 失败，请见下方独立文件方案。"
            >
              <Select style={{ width: 220 }}>
                <Select.Option value="chrome">Chrome</Select.Option>
                <Select.Option value="edge">Microsoft Edge</Select.Option>
                <Select.Option value="firefox">Firefox</Select.Option>
                <Select.Option value="chromium">Chromium</Select.Option>
                <Select.Option value="brave">Brave</Select.Option>
                <Select.Option value="opera">Opera</Select.Option>
                <Select.Option value="none">不使用浏览器 Cookie</Select.Option>
              </Select>
            </Form.Item>

            <Divider style={{ margin: '16px 0', fontSize: 13, fontWeight: 500 }} plain>
              或使用独立 Cookies 文件（最稳定，推荐）
            </Divider>

            <Form.Item
              label="国内平台 Cookies 文件"
              name="domesticCookiesPath"
              extra="解决 Chrome 运行时 yt-dlp 无法读取 cookie 数据库的问题。用 Get cookies.txt LOCALLY 扩展导出含 douyin.com 和 xiaohongshu.com 的 cookies 文件。配置后优先使用，浏览器来源仅作兜底。"
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <Form.Item name="domesticCookiesPath" noStyle>
                  <Input readOnly placeholder="未选择，将使用浏览器 Cookie..." />
                </Form.Item>
                <Button icon={<SafetyCertificateOutlined />} onClick={handleSelectDomesticCookiesFile}>选择文件</Button>
              </div>
            </Form.Item>
          </Card>
        )}

        {activeModule === 'ai' && (
          <>
            <Card bordered={false} style={cardStyle}>
              <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15 }}>
                <ApiOutlined style={{ marginRight: 6, color: '#ff0000' }} />
                YouTube 数据 API
              </div>

              <Form.Item
                label="API Key"
                name="youtubeApiKey"
                extra={
                  <span>
                    配置后订阅检查改走官方 Data API：全部视频精确播放量（不再受 RSS 最新 15 条限制）、点赞数、精确发布时间。
                    每日免费配额 10,000 单位，单频道检查一次约消耗 3 单位。
                    获取步骤：console.cloud.google.com → 新建项目 → 「API 和服务」启用 YouTube Data API v3 → 「凭据」创建 API 密钥。
                    留空则使用 yt-dlp + RSS 方案。
                  </span>
                }
              >
                <Input.Password placeholder="AIza..." autoComplete="off" />
              </Form.Item>

              <Form.Item style={{ marginBottom: 0 }}>
                <Button icon={<ApiOutlined />} loading={ytApiTesting} onClick={handleTestYtApi}>
                  测试连接
                </Button>
                {ytApiTestResult && (
                  <span style={{ marginLeft: 12, fontSize: 12, color: ytApiTestResult.ok ? '#52c41a' : '#ff4d4f' }}>
                    {ytApiTestResult.message}
                  </span>
                )}
                {ytQuota && (
                  <span style={{ marginLeft: 12, fontSize: 12, color: '#888' }}>
                    今日 API 配额：{ytQuota.used.toLocaleString()} / {ytQuota.limit.toLocaleString()}（太平洋时间 0 点重置）
                  </span>
                )}
              </Form.Item>
            </Card>

            <Card bordered={false} style={{ ...cardStyle, marginTop: 24 }}>
              <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15 }}>
                <RobotOutlined style={{ marginRight: 6, color: '#1677ff' }} />
                AI 分析（LLM）
              </div>

              <Form.Item
                label="API Base URL"
                name={['llm', 'baseUrl']}
                extra="OpenAI 兼容接口地址，支持 DeepSeek / Moonshot / OpenAI / 各类中转站。例：https://api.deepseek.com/v1"
              >
                <Input placeholder="https://api.deepseek.com/v1" />
              </Form.Item>

              <Form.Item label="API Key" name={['llm', 'apiKey']}>
                <Input.Password placeholder="sk-..." autoComplete="off" />
              </Form.Item>

              <Form.Item
                label="模型名称"
                name={['llm', 'model']}
                extra="例：deepseek-chat / gpt-4o-mini / moonshot-v1-8k"
              >
                <Input placeholder="deepseek-chat" style={{ width: 280 }} />
              </Form.Item>

              <Form.Item
                label="爆款视频自动 AI 拆解"
                name="autoAnalyzeHot"
                valuePropName="checked"
                extra="检查订阅时，发现播放量超过频道中位数 2 倍的新视频，自动提取文案并 AI 拆解（标题 + 开头钩子），结果缓存在视频上。需要先配置上方 API。"
              >
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>

              <Form.Item style={{ marginBottom: 0 }}>
                <Button icon={<ApiOutlined />} loading={llmTesting} onClick={handleTestLlm}>
                  测试连接
                </Button>
                {llmTestResult && (
                  <span style={{ marginLeft: 12, fontSize: 12, color: llmTestResult.ok ? '#52c41a' : '#ff4d4f' }}>
                    {llmTestResult.message}
                  </span>
                )}
              </Form.Item>
            </Card>
          </>
        )}

        {activeModule === 'system' && (
          <>
            <Card bordered={false} style={cardStyle}>
              <h3 style={{ marginBottom: 16 }}>系统日志</h3>
              <p style={{ color: '#666', marginBottom: 16 }}>
                如果遇到下载出错或无法解析，可以查看日志文件中 yt-dlp 的原生报错信息。
              </p>
              <Button icon={<FileTextOutlined />} onClick={handleOpenLogs}>
                打开日志文件夹
              </Button>
            </Card>

            <Card
              bordered={false}
              style={{ ...cardStyle, marginTop: 24 }}
              title={
                <span>
                  <SyncOutlined style={{ marginRight: 6, color: '#1677ff' }} />
                  yt-dlp 版本管理
                </span>
              }
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                {ytdlpLoading ? (
                  <Spin size="small" />
                ) : ytdlpInfo?.available ? (
                  <span style={{ fontSize: 13, color: '#52c41a' }}>
                    <CheckCircleOutlined style={{ marginRight: 4 }} />
                    已检测到 yt-dlp {ytdlpInfo.version ? `v${ytdlpInfo.version}` : ''}
                  </span>
                ) : (
                  <span style={{ fontSize: 13, color: '#ff4d4f' }}>未检测到 yt-dlp，请确认已安装并添加至 PATH</span>
                )}
                <Button
                  type="primary"
                  icon={<SyncOutlined spin={updating} />}
                  loading={updating}
                  disabled={!ytdlpInfo?.available}
                  onClick={handleUpdateYtdlp}
                >
                  {updating ? '更新中...' : '一键更新到最新版'}
                </Button>
                {updateResult && (
                  <Tag
                    color={updateResult === 'updated' ? 'success' : 'blue'}
                    icon={<CheckCircleOutlined />}
                    style={{ marginLeft: 4, animation: 'fadeIn 0.3s ease-in' }}
                  >
                    {updateResult === 'updated' ? '更新成功' : '已是最新'}
                  </Tag>
                )}
              </div>
              {updateOutput && (
                <pre
                  style={{
                    background: '#1a1a1a',
                    color: '#d4d4d4',
                    borderRadius: 6,
                    padding: '10px 14px',
                    fontSize: 12,
                    maxHeight: 200,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    marginBottom: 0,
                  }}
                >
                  {updateOutput}
                </pre>
              )}
              <p style={{ color: '#888', fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                yt-dlp 版本过旧时解析/下载可能失败（YouTube 会频繁更新规则）。建议每隔一两周更新一次。
              </p>
            </Card>
          </>
        )}
      </Form>
    </div>
  )
}

export default Settings
