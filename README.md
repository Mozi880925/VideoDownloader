# VideoDownloader

基于 yt-dlp 的桌面应用，定位是**「YouTube 对标研究工作台」**：从下载器起步，现已覆盖下载、频道订阅监控、蓝海新频道雷达、AI 转录提纯与飞书交付、选题灵感库的完整链路。

## 技术栈

Electron 33 + React 18 + TypeScript 5 + Vite 6 + Ant Design 5 + Zustand + better-sqlite3

数据源：yt-dlp（下载/解析）+ YouTube Data API v3（可选，精确播放量/频道扫描）+ OpenAI 兼容 LLM API（可选，AI 分析/提纯）+ 飞书开放平台（可选，文档交付）。

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 类型检查
npm run typecheck

# 打包
npm run build
```

**前置条件**：系统已安装 [yt-dlp](https://github.com/yt-dlp/yt-dlp)、[ffmpeg](https://ffmpeg.org/)，并确保它们在 PATH 中。Whisper 转写需额外安装 [whisper.cpp](https://github.com/ggerganov/whisper.cpp)。所有可选服务（YouTube Data API Key、LLM API、飞书自建应用凭据）均在应用内「设置」页配置，留空则对应功能自动降级或禁用，不影响核心下载。

## 功能

### 下载
- 单视频 / 搜索 / 播放列表 / 批量（并发 1-5 路）
- YouTube、Bilibili、抖音、小红书、小宇宙播客等多平台
- 章节裁剪、自定义时间段、仅音频 MP3
- 字幕下载（手动/自动/嵌入/转 SRT）
- 格式选择、文件夹自动整理（按频道/按月）

### 素材管理
- 标签编辑 + 点击筛选 + 日期范围筛选
- 关键帧提取（均匀 / 场景变化 / 时间戳）
- 文件存在性检测、导出 JSON/CSV

### 频道订阅
- 频道分组 + 置顶 + 定时检查
- 视频列表展示（播放量、日期、🔥 爆款标记、播放量增速）
- 列表/卡片视图切换
- 桌面通知、一键加入批量下载

### 蓝海雷达
- 关键词扫描 YouTube 近期活跃频道（每日定额，非海量爬取）
- 新锐频道榜单：建号月龄、月均吸粉速度、订阅/播放量排序筛选
- 扫描进度可视化、YouTube API 配额实时余量展示
- 频道库持久沉淀，历史扫描记录可查

### 字幕和转录
- Whisper 本地转写（whisper.cpp），支持本地文件与在线 URL（含播客）直接转录
- 在线字幕抓取（人工/自动字幕）
- **AI 提纯整理**：转录稿/字幕经 LLM 分块整理为「分享式提纯版原文」（非摘要，去噪、修 ASR 错词、保留原意判断链），支持断点续跑
- 提纯稿库：查看、导出 Markdown、**一键交付飞书文档**
- 字幕文稿查看器（搜索/复制/导出）

### 创作辅助
- 选题灵感库（Kanban：待定 → 计划中 → 拍摄中 → 已发布）
- LLM 标题/频道标题规律分析（OpenAI 兼容 API）
- 自动爆款检测 + AI 拆解

### 基础设施
- 代理配置、Cookies 管理（含国内平台独立 cookies 文件）、应用内 YouTube 登录
- yt-dlp 版本检测 + 一键更新
- 磁盘空间预估、YouTube API 每日配额账本

## 数据库

SQLite（WAL 模式），PRAGMA user_version 编号迁移，含下载记录、订阅、雷达频道库、提纯稿等 14 张表。

## 目录结构

```
src/
├── shared/       主/渲染共享：types.ts、ipcContract.ts（IPC 通道唯一真源）、错误翻译、URL 提取
├── main/
│   ├── index.ts  仅生命周期 + createWindow + registerAllIpc()
│   ├── preload.ts 由 ipcContract 派生生成
│   ├── ipc/      按域拆分的 handler（download/ytdlp/media/db/subscription/radar/distill/network/llm/cookies/settings/fs/window）
│   └── services/ 业务逻辑：ytdlp（下载/解析）、db、subscription、radar、distill、feishu、
│                 youtubeApi、youtubeQuota、llm、whisper、ffmpeg、transcript、autoAnalysis、
│                 toolPaths、processUtils、settingsHub、cookiesService
└── renderer/
    ├── pages.tsx 页面注册唯一来源（PageKey / 组件映射 / 侧边栏菜单）
    ├── store/    Zustand：navStore、settingsStore、activeTasksStore、historyStore、
    │             batchStore、transcribeStore
    ├── theme/    设计 token 唯一来源
    ├── components/ PageTitle、Thumbnail、Sidebar 等公共组件
    └── pages/    每页一个文件夹：下载 / 批量 / 列表 / 订阅 / 蓝海雷达 / 选题库 /
                  字幕和转录（合并页）/ 网络 / 设置 / 关于
```

## 项目规范

详见 [CLAUDE.md](./CLAUDE.md)（架构地图、IPC/数据库/渲染层约定、开发纪律）。
