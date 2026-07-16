import React, { useEffect, useState } from 'react'
import PageTitle from '../../components/PageTitle'
import { Button, Input, Alert, Spin, message } from 'antd'
import {
  GlobalOutlined,
  ApiOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useSettingsStore } from '../../store/settingsStore'
import type { ProxyType, NetworkTestResult, IpInfo } from '../../../shared/types'

// ────────── 代理类型卡片 ──────────

interface ProxyCardProps {
  selected: boolean
  title: string
  desc: string
  onClick: () => void
}

const ProxyCard: React.FC<ProxyCardProps> = ({ selected, title, desc, onClick }) => (
  <div
    onClick={onClick}
    style={{
      flex: '1 1 calc(50% - 6px)',
      padding: '14px 16px',
      borderRadius: 10,
      border: `2px solid ${selected ? '#1677ff' : '#e8e8e8'}`,
      background: selected ? '#f0f5ff' : '#fafafa',
      cursor: 'pointer',
      transition: 'all 0.2s',
      userSelect: 'none',
    }}
  >
    <div style={{ fontWeight: 600, fontSize: 13, color: selected ? '#1677ff' : '#333' }}>{title}</div>
    <div style={{ fontSize: 12, color: '#999', marginTop: 3 }}>{desc}</div>
  </div>
)

// ────────── 站点测试卡片 ──────────

interface SiteCardProps {
  result: NetworkTestResult
  testing: boolean
}

const SiteCard: React.FC<SiteCardProps> = ({ result, testing }) => {
  const bg = testing ? '#fafafa' : result.success ? '#f6ffed' : '#fff2f0'
  const borderColor = testing ? '#e8e8e8' : result.success ? '#b7eb8f' : '#ffccc7'
  const statusColor = result.success ? '#52c41a' : '#ff4d4f'
  const statusText = result.success ? '可连接' : '不可连接'

  return (
    <div style={{
      background: bg,
      border: `1px solid ${borderColor}`,
      borderRadius: 10,
      padding: '12px 14px',
      transition: 'all 0.3s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{result.name}</span>
        {testing
          ? <Spin indicator={<LoadingOutlined style={{ fontSize: 14 }} />} />
          : <span style={{ fontSize: 12, color: statusColor, fontWeight: 500 }}>
              {result.success
                ? <><CheckCircleFilled style={{ marginRight: 3 }} />{statusText}</>
                : <><CloseCircleFilled style={{ marginRight: 3 }} />{statusText}</>}
            </span>
        }
      </div>
      {!testing && (
        <div style={{ fontSize: 12, color: '#888' }}>
          {result.statusCode ? `HTTP 状态：${result.statusCode}` : '无响应'}
          <br />
          {result.latency >= 0 ? `延迟：${result.latency}ms` : '超时'}
        </div>
      )}
    </div>
  )
}

// ────────── IP 信息卡片 ──────────

const IpCard: React.FC<{ info: IpInfo | null; loading: boolean }> = ({ info, loading }) => {
  if (loading) return (
    <div style={{ textAlign: 'center', padding: 20, color: '#aaa' }}>
      <Spin indicator={<LoadingOutlined />} /> <span style={{ marginLeft: 8 }}>查询 IP 信息...</span>
    </div>
  )
  if (!info) return (
    <div style={{ padding: '12px 0', color: '#bbb', fontSize: 13 }}>IP 信息获取失败</div>
  )

  // 解析服务商/自治域
  const asnNum = info.asn?.replace('AS', '') || '-'
  const orgName = info.org?.replace(/^AS\d+\s*/, '') || '-'

  return (
    <div style={{
      background: '#f8f9fc',
      border: '1px solid #e8e8e8',
      borderRadius: 10,
      padding: 16,
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{
          background: '#1677ff',
          color: '#fff',
          fontWeight: 700,
          fontSize: 13,
          borderRadius: 6,
          padding: '3px 8px',
          letterSpacing: 0.5,
        }}>
          {info.country_code}
        </span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>IP 信息</div>
          <div style={{ fontSize: 12, color: '#888' }}>{info.city}, {info.region}, {info.country_name}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
        <div>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 1 }}>IP</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{info.ip}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 1 }}>自治域</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{asnNum}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 1 }}>服务商</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{orgName}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 1 }}>时区</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{info.timezone}</div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 1 }}>位置</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{info.city}, {info.region}, {info.country_name}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 1 }}>经纬度</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{info.latitude.toFixed(2)}, {info.longitude.toFixed(2)}</div>
        </div>
      </div>
    </div>
  )
}

// ────────── 工具函数 ──────────

const PROXY_TYPE_LABEL: Record<ProxyType, string> = {
  none: '不使用代理',
  system: '使用系统代理',
  http: 'HTTP 代理',
  socks5: 'SOCKS5 代理',
}

const OVERSEAS = ['YouTube', 'Twitter/X', 'Instagram', 'TikTok']
const DOMESTIC = ['抖音', '小红书', 'Bilibili', '百度']

const EMPTY_RESULTS: NetworkTestResult[] = [
  ...OVERSEAS.map(name => ({ name, url: '', success: false, latency: 0 })),
  ...DOMESTIC.map(name => ({ name, url: '', success: false, latency: 0 })),
]

// ────────── 主页面 ──────────

const Network: React.FC = () => {
  const appSettings = useSettingsStore(s => s.appSettings)
  const updateSettings = useSettingsStore(s => s.updateSettings)

  const [proxyType, setProxyTypeLocal] = useState<ProxyType>(appSettings.proxyType ?? 'none')
  const [proxyHost, setProxyHost] = useState(appSettings.proxyHost ?? '')
  const [proxyPort, setProxyPort] = useState(appSettings.proxyPort ?? '')
  const [proxyUsername, setProxyUsername] = useState(appSettings.proxyUsername ?? '')
  const [proxyPassword, setProxyPassword] = useState(appSettings.proxyPassword ?? '')
  const [saving, setSaving] = useState(false)
  const [savedType, setSavedType] = useState<ProxyType>(appSettings.proxyType ?? 'none')

  const [testResults, setTestResults] = useState<NetworkTestResult[]>([])
  const [testing, setTesting] = useState(false)

  const [ipInfo, setIpInfo] = useState<IpInfo | null>(null)
  const [ipLoading, setIpLoading] = useState(false)

  useEffect(() => {
    setProxyTypeLocal(appSettings.proxyType ?? 'none')
    setProxyHost(appSettings.proxyHost ?? '')
    setProxyPort(appSettings.proxyPort ?? '')
    setProxyUsername(appSettings.proxyUsername ?? '')
    setProxyPassword(appSettings.proxyPassword ?? '')
    setSavedType(appSettings.proxyType ?? 'none')
  }, [appSettings.proxyType, appSettings.proxyHost, appSettings.proxyPort, appSettings.proxyUsername, appSettings.proxyPassword])

  const needsHostPort = proxyType === 'http' || proxyType === 'socks5'

  const handleSave = async () => {
    if (needsHostPort && (!proxyHost.trim() || !proxyPort.trim())) {
      message.warning('请填写代理地址和端口')
      return
    }
    setSaving(true)
    try {
      // updateSettings 内部会全量同步到主进程（yt-dlp 代理参数 + Electron session）
      updateSettings({
        proxyType,
        proxyHost: proxyHost.trim(),
        proxyPort: proxyPort.trim(),
        proxyUsername: proxyUsername.trim(),
        proxyPassword: proxyPassword.trim(),
      })
      setSavedType(proxyType)
      message.success('代理设置已保存')
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResults(EMPTY_RESULTS)
    setIpLoading(true)
    try {
      const [results, ip] = await Promise.all([
        window.api.testNetwork(),
        window.api.getIpInfo(),
      ])
      setTestResults(results)
      setIpInfo(ip)
    } catch {
      message.error('测试失败')
    } finally {
      setTesting(false)
      setIpLoading(false)
    }
  }

  const overseasResults = testResults.filter(r => OVERSEAS.includes(r.name))
  const domesticResults = testResults.filter(r => DOMESTIC.includes(r.name))

  // 构建当前生效的代理 URL（用于底部提示）
  const effectiveProxyUrl = (() => {
    if (savedType === 'none') return ''
    if (savedType === 'system') return '系统代理'
    const h = appSettings.proxyHost, p = appSettings.proxyPort
    if (!h || !p) return ''
    const scheme = savedType === 'socks5' ? 'socks5' : 'http'
    return `${scheme}://${h}:${p}`
  })()

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <PageTitle
        title="网络"
        size={24}
        style={{ marginBottom: 6 }}
        subtitle="配置下载与解析时使用的代理，并测试常用站点连通性"
        subtitleStyle={{ color: '#888', marginBottom: 24, fontSize: 14 }}
      />

      {/* ── 两栏布局 ── */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* ── 左栏：代理设置 ── */}
        <div style={{ flex: 1, background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>代理类型</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>选择当前客户端的网络访问方式。</div>
            </div>
            <Button type="primary" loading={saving} onClick={handleSave} style={{ borderRadius: 8 }}>
              保存
            </Button>
          </div>

          <Alert
            type="info"
            showIcon
            icon={<GlobalOutlined />}
            style={{ marginBottom: 12, fontSize: 12 }}
            message={
              <span>
                <strong>国内外网络分流：</strong>解析国内平台（如 B 站、抖音等）时不需要代理。建议您的代理软件保持在
                "规则 / PAC 模式"（绕过大陆）。若遇到国内平台下载极慢，请临时切换为上方"不使用代理"。
              </span>
            }
          />

          {/* 已保存状态 */}
          <div style={{
            background: '#fff2f0',
            border: '1px solid #ffccc7',
            borderRadius: 8,
            padding: '8px 14px',
            marginBottom: 14,
            fontSize: 13,
            color: '#cf1322',
          }}>
            已保存：<strong>{PROXY_TYPE_LABEL[savedType]}</strong>
          </div>

          {/* 代理类型卡片 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            <ProxyCard selected={proxyType === 'none'} title="不使用代理" desc="所有请求直接访问网络" onClick={() => setProxyTypeLocal('none')} />
            <ProxyCard selected={proxyType === 'system'} title="使用系统代理" desc="沿用当前系统设置中的代理" onClick={() => setProxyTypeLocal('system')} />
            <ProxyCard selected={proxyType === 'http'} title="HTTP 代理" desc="手动指定 HTTP 或 HTTPS 代理" onClick={() => setProxyTypeLocal('http')} />
            <ProxyCard selected={proxyType === 'socks5'} title="SOCKS5 代理" desc="手动指定 SOCKS5 代理" onClick={() => setProxyTypeLocal('socks5')} />
          </div>

          {/* HTTP / SOCKS5 输入 */}
          {needsHostPort && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>代理地址</div>
                <Input prefix={<ApiOutlined style={{ color: '#bbb' }} />} placeholder="127.0.0.1" value={proxyHost} onChange={e => setProxyHost(e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>代理端口</div>
                <Input placeholder="1080" value={proxyPort} onChange={e => setProxyPort(e.target.value.replace(/\D/g, ''))} maxLength={5} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>用户名</div>
                <Input placeholder="选填" value={proxyUsername} onChange={e => setProxyUsername(e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>密码</div>
                <Input.Password placeholder="选填" value={proxyPassword} onChange={e => setProxyPassword(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* ── 右栏：网络测试 ── */}
        <div style={{ flex: 1, background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>网络测试</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                点击开始测试，检查 YouTube、Twitter、Instagram、抖音、小红书和百度的连接情况。
              </div>
            </div>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              loading={testing}
              onClick={handleTest}
              style={{ borderRadius: 8, flexShrink: 0 }}
            >
              {testResults.length > 0 ? '重新测试' : '开始测试'}
            </Button>
          </div>

          {/* IP 信息卡片 */}
          {(ipLoading || ipInfo) && <IpCard info={ipInfo} loading={ipLoading} />}

          {/* 站点测试结果 */}
          {testResults.length > 0 ? (
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#888', fontWeight: 600, marginBottom: 8 }}>海外站点</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {overseasResults.map(r => <SiteCard key={r.name} result={r} testing={testing} />)}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#888', fontWeight: 600, marginBottom: 8 }}>国内站点</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {domesticResults.map(r => <SiteCard key={r.name} result={r} testing={testing} />)}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#bbb', padding: '40px 0', fontSize: 13 }}>
              <GlobalOutlined style={{ fontSize: 36, marginBottom: 10, display: 'block' }} />
              点击「开始测试」检查各平台连通性
            </div>
          )}

          {/* 底部代理信息 */}
          {effectiveProxyUrl && (
            <div style={{ marginTop: 16, fontSize: 12, color: '#aaa', borderTop: '1px solid #f5f5f5', paddingTop: 10 }}>
              当前实际代理　{effectiveProxyUrl}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

export default Network
