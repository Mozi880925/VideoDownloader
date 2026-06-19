import { create } from 'zustand'
import type { AppSettings } from '../../shared/types'

function loadSettings(): AppSettings {
  const defaults: AppSettings = {
    defaultFormat: 'best',
    downloadPath: '',
    namingRule: '%(extractor_key)s_%(uploader,creator,channel)s_%(title).50s_%(upload_date>%Y%m%d)s.%(ext)s',
    enableNotification: true,
    cookiesPath: '',
    subtitles: {
      enabled: false,
      languages: ['zh', 'zh-Hans', 'zh-CN'],
      includeAuto: false,
      embed: false,
      convertToSrt: true,
    },
    whisper: {
      executablePath: '',
      modelPath: '',
      language: 'auto',
      threads: 4,
    },
    subscriptionCheckInterval: '6h',
    maxConcurrentDownloads: 3,
    folderOrganize: 'none',
    proxyType: 'none',
    douyinCookiesBrowser: 'chrome',
    proxyHost: '',
    proxyPort: '',
    llm: {
      baseUrl: '',
      apiKey: '',
      model: '',
    },
    autoAnalyzeHot: false,
    youtubeApiKey: '',
  }
  try {
    const s = localStorage.getItem('vdownload_settings')
    if (s) {
      const saved = JSON.parse(s)
      return {
        ...defaults,
        ...saved,
        subtitles: { ...defaults.subtitles!, ...(saved.subtitles ?? {}) },
        whisper: { ...defaults.whisper!, ...(saved.whisper ?? {}) },
        llm: { ...defaults.llm!, ...(saved.llm ?? {}) },
      }
    }
  } catch {}
  return defaults
}

interface SettingsStore {
  appSettings: AppSettings
  updateSettings: (settings: Partial<AppSettings>) => void

  retryUrl: string | null
  setRetryUrl: (url: string) => void
  clearRetryUrl: () => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  appSettings: loadSettings(),

  updateSettings: (newSettings) => set((state) => {
    const updated = { ...state.appSettings, ...newSettings }
    localStorage.setItem('vdownload_settings', JSON.stringify(updated))
    return { appSettings: updated }
  }),

  retryUrl: null,
  setRetryUrl: (url) => set({ retryUrl: url }),
  clearRetryUrl: () => set({ retryUrl: null }),
}))
