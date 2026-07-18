# VideoDownloader 项目规范

## 项目简介

个人使用的「YouTube 对标研究工作台」桌面应用：从视频下载器起步，现已包含
下载（单视频/批量/搜索/播放列表）、频道订阅监控、播放量快照与爆款探测、
AI 标题/频道拆解、选题灵感库、字幕提取与 Whisper 转录（含 URL/播客直接
转录）、AI 提纯整理（转录稿→分享式提纯版原文，分块+断点续跑）、飞书文档
交付、蓝海雷达（关键词扫描 → 新锐频道榜单 → 频道库沉淀）。底层使用
yt-dlp + YouTube Data API + LLM API（OpenAI 兼容）+ 飞书开放平台。

蓝海雷达评分目前是月均吸粉速度（订阅数/建号月龄）单指标排序，「蓝海指数」
综合评分公式待二期（需数周真实扫描数据调权重）。

## 技术栈

- Electron + React 18 + TypeScript
- UI：Ant Design 5.x（中文语言包 zhCN）
- 状态管理：Zustand
- 下载引擎：yt-dlp（child_process.spawn）；数据源：YouTube Data API v3（可选）
- 数据库：better-sqlite3（PRAGMA user_version 编号迁移）
- 构建：Vite + electron-builder；`npm run typecheck` 双 tsconfig 全量类型检查
- 系统：Windows

## 架构地图

```
src/
├── shared/            # 主/渲染共享：types.ts、ipcContract.ts（IPC 唯一真源）、errorTranslator、extractUrls、dateUtils
├── main/
│   ├── index.ts       # 只有生命周期 + createWindow + registerAllIpc()
│   ├── preload.ts     # 由 ipcContract 的 apiMethods/listenerMethods 工厂生成
│   ├── ipc/           # 按域拆分的 handler（typed.ts 提供类型安全 handle/sendTo/sendToAll）
│   └── services/      # 业务：ytdlp/（目录）、db、subscription、radar、distill、feishu、
│                      #      youtubeApi、youtubeQuota、llm、autoAnalysis、transcript、
│                      #      whisper、ffmpeg、toolPaths、processUtils、settingsHub、
│                      #      cookiesService、fsUtils、logger
└── renderer/
    ├── pages.tsx      # 页面注册唯一来源（PageKey/组件映射/侧边栏菜单）
    ├── theme/tokens.ts# 设计 token 唯一来源
    ├── store/         # navStore / settingsStore / activeTasksStore / historyStore /
    │                  # batchStore / transcribeStore
    ├── utils/         # format、id、storage、platform、buildOutputPath、videoParse、downloadRunner
    ├── components/    # PageTitle、Thumbnail、Sidebar 等公共组件
    └── pages/         # 每页一个文件夹；大页面拆子组件 + 页面级 hook
```

## 架构规矩（改代码必须遵守）

- **IPC**：通道名/参数/返回类型只在 `shared/ipcContract.ts` 定义一处；主进程 handler
  一律用 `ipc/typed.ts` 的 `handle()`，事件推送用 `sendTo/sendToAll`。新增通道 =
  改契约 + 加 handler 两步，preload 与 window.api 类型自动派生。
  通道命名 `domain:action`，事件 `event:*` 前缀。
- **设置**：渲染端 localStorage 是唯一真源，`updateSettings` 自动全量推送
  `settings:sync`；主进程消费方集中在 `ipc/settings.ts` 的
  `bootstrapSettingsConsumers()`。新增需要主进程感知的设置字段只改
  AppSettings + 消费方两处，禁止新开零散 setter 通道。
- **数据库**：schema 变更一律在 `db.ts` 的 MIGRATIONS 里新增编号迁移
  （下一个 v4），禁止往 baseline 里补 IF NOT EXISTS 补丁；多表写操作包事务；
  row→domain 映射在 db 层完成，IPC 只传 domain 类型；日志走 logInfo/logError。
- **YouTube API**：一律通过 `youtubeApi.apiGet()` 调用（自动记账配额）；
  大额消费（search 100 单位/次）调用前用 `youtubeQuota.canSpend()` 检查余量，
  给订阅检查留保底。
- **渲染层**：新页面只改 `pages.tsx` 一处；跨页跳转走 navStore；解析用
  `utils/videoParse.runParse`、下载启动用 `utils/downloadRunner.runDownload`，
  不要在页面里手写这两条链路；localStorage 走 `utils/storage`（新 key 用
  `vd:` 前缀）；任务 ID 用 `utils/id.genTaskId`。
- **样式**：颜色/圆角/渐变从 `theme/tokens.ts` 取，新代码禁止硬编码
  `#1677ff` 等魔法值；message/notification 用 `App.useApp()`，禁止静态
  `message.xxx` 调用；页面标题用 `<PageTitle>`，缩略图用 `<Thumbnail>`。

## 界面规范

- 整体布局：左侧导航栏 220px 白色 + 右侧内容区 #f5f5f5 背景
- 主色：#1677ff（tokens.PRIMARY）
- 圆角：卡片 8px，按钮 6px，输入框 6px
- 页面标题：蓝色渐变大字（字幕/转录模块用紫色渐变 PURPLE_GRADIENT）
- Tab 切换：胶囊风格（Ant Design Segmented）
- 所有界面文字中文
- Electron 窗口默认 1400x900

## 导航结构（pages.tsx 为准）

- 下载器（分组）：视频下载（单视频 | 搜索 | 播放列表）、批量下载、下载列表
- 频道订阅（双栏：频道列表 + 视频流，含爆款探测/AI 拆解/文案提取）
- 蓝海雷达（关键词管理 + 扫描 + 新锐频道榜单）
- 选题灵感库
- 字幕和转录（合并页，胶囊 Tab 切换）：AI 识别字幕（含 URL/播客转录）|
  字幕提取 | 提纯稿库（AI 提纯 + 飞书交付）；Whisper 引擎配置在
  「设置 → 字幕设置」，非独立导航项
- 网络（代理 + 连通性测试）
- 设置（常规/字幕/Cookie/AI 与数据源/系统）
- 关于

## 核心工程约束

### 安全与进程

- contextIsolation: true，nodeIntegration: false；主窗口 sandbox: false
  （preload 需 require 编译后的 shared/ipcContract）
- 主进程处理 yt-dlp、文件、路径解析、数据库、IPC
- 渲染进程只负责 UI 和状态展示
- 子进程杀树统一用 `services/processUtils.killProcessTree`

### 下载链路

- 工具路径解析集中在 `services/toolPaths.ts`（yt-dlp / JS runtime / ffmpeg / ffprobe），
  不要依赖硬编码路径，不要假设 PATH 一定正确，所有关键路径都要打印日志

### yt-dlp 调用约束

- parseVideo 和 downloadVideo 必须使用一致的 runtime / extractor 策略
  （公共参数在 `services/ytdlp/config.ts` 的 buildBaseArgs）
- 对 YouTube，优先显式传 --js-runtimes node:<absolute_node_path>
- downloadVideo 额外使用：--ffmpeg-location、--newline、--progress、
  --progress-template、--print after_move:filepath

### 进度与完成态

- 使用结构化输出标记：[VD_PROGRESS]、[VD_FILEPATH]
- 只有最终文件真实存在时，才标记 completed；临时文件存在不算成功

### 默认格式策略

- 用户未手选 format id 时，默认 -f "bv*+ba/b"（无 ffmpeg 时降级单流）
- 用户手选 format id 时，才使用指定 id
- 不要在 parse 和 download 阶段使用不一致的 client / runtime 参数

### Cookies

- 不要硬编码 cookies.txt 路径；路径经 settingsHub 分发到 ytdlp/config
- 国内平台（抖音/小红书）优先独立 cookies 文件，回退 --cookies-from-browser
- 下载前必须检查 cookies 文件是否存在，并输出日志

## 代码风格

- 组件用函数式 + hooks
- 文件命名：组件 PascalCase，工具函数 camelCase
- 每个模块一个文件夹，index.tsx 作为入口；大页面按「index 编排 + 子组件 +
  页面级 hook」拆分
- 优先使用 Ant Design 现有组件，少写自定义 CSS

## 开发纪律

- 一次只推进一个闭环
- 每完成一个模块必须保证可编译（`npm run typecheck`）、可运行、可验证
- 先实现核心功能，再美化 UI
- 不要安装不必要的依赖
- 遇到阻塞主链路的关键不确定点再问我；非关键细节先做保守实现，并在回复中说明假设
- 改完后先自测，再回复我
