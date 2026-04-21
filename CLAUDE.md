\# VideoDownloader 项目规范



\## 项目简介

个人使用的本地视频下载器桌面应用，底层使用 yt-dlp，界面参考 DataTool 下载器风格。

当前第一优先级：先打通“单视频下载”最小可用闭环。



\## 技术栈

\- Electron + React 18 + TypeScript

\- UI：Ant Design 5.x（中文语言包 zhCN）

\- 状态管理：Zustand

\- 下载引擎：yt-dlp（通过 child\_process.spawn 调用）

\- 数据库：better-sqlite3（非第一阶段必需）

\- 构建：Vite + electron-builder

\- 系统：Windows



\## 界面规范

\- 整体布局：左侧导航栏 220px 白色 + 右侧内容区 #f5f5f5 背景

\- 主色：#1677ff

\- 圆角：卡片 8px，按钮 6px，输入框 6px

\- 导航选中态：蓝色文字 + 左侧蓝色竖条

\- 页面标题：蓝色渐变大字

\- Tab 切换：胶囊风格（Ant Design Segmented 或自定义）

\- 所有界面文字中文

\- Electron 窗口默认 1400x900



\## 导航结构

\- 下载器（可展开分组）

&#x20; - 视频下载（单视频 | 用户主页 | 搜索 | 播放列表 | 资源嗅探）

&#x20; - 批量下载

&#x20; - 下载列表

\- 设置

\- 关于



\## 核心工程约束



\### 安全与进程

\- contextIsolation: true，通过 preload.ts 暴露 API

\- 主进程处理 yt-dlp、文件、路径解析、数据库、IPC

\- 渲染进程只负责 UI 和状态展示



\### 下载链路

\- 必须实现：

&#x20; - resolveYtDlpPath()

&#x20; - resolveNodeJsRuntime()

&#x20; - resolveFfmpegPath()

&#x20; - resolveCookiesPath()

\- 不要依赖硬编码路径

\- 不要假设 PATH 一定正确

\- 所有关键路径都要打印日志



\### yt-dlp 调用约束

\- parseVideo 和 downloadVideo 必须使用一致的 runtime / extractor 策略

\- 对 YouTube，优先显式传：

&#x20; - --no-js-runtimes

&#x20; - --js-runtimes node:<absolute\_node\_path>

\- downloadVideo 额外使用：

&#x20; - --ffmpeg-location <absolute\_ffmpeg\_path>

&#x20; - --newline

&#x20; - --progress

&#x20; - --progress-template

&#x20; - --print after\_move:filepath



\### 进度与完成态

\- 不要只依赖默认 stdout 文本格式

\- 使用结构化输出标记：

&#x20; - \[VD\_PROGRESS]

&#x20; - \[VD\_FILEPATH]

\- 只有最终文件真实存在时，才标记 completed

\- 临时文件存在不算成功



\### 默认格式策略

\- 用户未手选 format id 时，默认使用：

&#x20; - -f "bv\*+ba/b"

\- 用户手选 format id 时，才使用指定 id

\- 不要默认落到 HLS-only 方案

\- 不要在 parse 和 download 阶段使用不一致的 client / runtime 参数



\### Cookies

\- 不要硬编码 cookies.txt 路径

\- 支持：

&#x20; - 手动 cookies.txt

&#x20; - 后续扩展 cookies-from-browser

\- 下载前必须检查 cookies 文件是否存在，并输出日志



\## 代码风格

\- 组件用函数式 + hooks

\- 文件命名：组件 PascalCase，工具函数 camelCase

\- 每个模块一个文件夹，index.tsx 作为入口

\- 优先使用 Ant Design 现有组件，少写自定义 CSS



\## 开发纪律

\- 一次只推进一个闭环

\- 每完成一个模块必须保证可编译、可运行、可验证

\- 先实现核心功能，再美化 UI

\- 不要安装不必要的依赖

\- 遇到阻塞主链路的关键不确定点再问我；非关键细节先做保守实现，并在回复中说明假设

\- 改完后先自测，再回复我

