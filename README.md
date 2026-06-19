# VideoDownloader

基于 yt-dlp 的桌面视频下载器，面向 YouTuber / 视频创作者的本地素材工作站。

## 技术栈

Electron 33 + React 18 + TypeScript 5 + Vite 6 + Ant Design 5 + Zustand + better-sqlite3

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 打包
npm run build
```

**前置条件**：系统已安装 [yt-dlp](https://github.com/yt-dlp/yt-dlp)、[ffmpeg](https://ffmpeg.org/)，并确保它们在 PATH 中。Whisper 转写需额外安装 [whisper.cpp](https://github.com/ggerganov/whisper.cpp)。

## 功能

### 下载
- 单视频 / 搜索 / 播放列表 / 批量（并发 1-5 路）
- 抖音（Chrome 浏览器 Cookie）、YouTube、Bilibili 等多平台
- 章节裁剪、自定义时间段、仅音频 MP3
- 字幕下载（手动/自动/嵌入/转 SRT）
- 格式选择、文件夹自动整理（按频道/按月）

### 素材管理
- 标签编辑 + 点击筛选 + 日期范围筛选
- 关键帧提取（均匀 / 场景变化 / 时间戳）
- Whisper 本地转写（whisper.cpp）
- 字幕文稿查看器（搜索/复制/导出 TXT）
- 文件存在性检测、导出 JSON/CSV

### 频道订阅
- 频道分组 + 置顶 + 定时检查
- 视频列表展示（播放量、日期、🔥 爆款标记）
- 列表/卡片视图切换
- 桌面通知、一键加入批量下载

### 创作辅助
- 选题灵感库（Kanban：待定 → 计划中 → 拍摄中 → 已发布）
- LLM 标题/频道分析（OpenAI 兼容 API）
- 自动爆款检测 + AI 拆解

### 基础设施
- 代理配置、Cookies 管理、应用内 YouTube 登录
- yt-dlp 版本检测 + 一键更新
- 磁盘空间预估

## 数据库

SQLite（WAL 模式），含 7 张表，支持自动 migration。

## 目录结构

```
src/
├── main/         主进程（IPC 路由 + 服务层）
│   ├── services/ yt-dlp · 数据库 · 订阅 · ffmpeg · whisper · LLM · 网络
│   └── index.ts  IPC handlers（50+ 通道）
├── renderer/     渲染进程（页面 + 组件 + store）
│   ├── pages/    下载 · 批量 · 列表 · 订阅 · 选题库 · 设置
│   ├── components/  VideoListPicker · SrtViewer · 关键帧 · 转写
│   └── store/    Zustand（taskStore + settingsStore）
└── shared/       类型 · 错误翻译 · URL 提取
```
