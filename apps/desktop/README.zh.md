# DSH Desktop

[English](README.md) | 中文

DSH Desktop 是非官方社区发行版，与 DeepSeek 无隶属关系，也未获得其背书。Electron 桌面应用是已交付 `dsh web` 组合的本地壳。它会让 Harness 后端在操作系统分配的 loopback 端口上启动，等待 CLI 的 `dsh web:` 就绪行，然后显示启用沙箱的应用窗口。关闭应用会向后端发送 `SIGTERM`，等待五秒让 Harness dispose（资源释放），并终止未能结算的子进程。

## 从 checkout 运行

安装依赖，然后启动桌面应用：

```sh
pnpm install
pnpm desktop:dev
```

该命令会先构建仓库，再启动 Electron。开发环境使用启动 pnpm 的 Node 可执行文件，因此现有原生 workspace 依赖会保持其 Node ABI。

桌面组合默认内置 [`dsh-plugin-clawrouters`](https://github.com/ropon/dsh-plugin-clawrouters)。全新 profile 的凭据引导会优先显示 ClawRouters，并通过现有凭据服务存储 `CLAWROUTERS_API_KEY`。只有未安装该插件路由时才回退到原生 DeepSeek 引导；用户也可以关闭引导，之后在「模型」中配置任意提供方。

内置插件遵循官方的[插件开发基础](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)与[发布结构](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish/)约定：导出 Cordis `apply` 模块，声明服务注入，提供 Schemastery `Config`，输出 DSH 标准可渲染工具结果，并通过 `dsh.bundle.patch` 标识 bundle patch。桌面启动器会实例化该 patch，再按文档将它作为最后的 `--patch` 层传入，因此插件仍可独立安装，而不是被写死在提供方逻辑中。

设置 `DSH_DESKTOP_CWD` 可选择后端的初始文件系统位置。如果未设置，应用会使用当前用户的主目录；workspace 仍需在 UI 中明确选择。

## 打包

为当前操作系统与 CPU 架构构建应用：

```sh
pnpm desktop:package
```

该命令会把未归档应用写入 `apps/desktop/out/`。如需面向用户的安装器，运行：

```sh
pnpm desktop:installer
```

安装器命令会构建完全相同的未归档应用，再用 Electron Builder 包装该已测试目录：macOS 生成拖入 Applications 的 DMG，Windows 生成按用户安装的引导式 NSIS EXE。安装器写入 `apps/desktop/installers/`；不会进行第二次应用重打包，因此冒烟测试的可执行文件与安装器负载之间的依赖图不会变化。

打包脚本会创建生产部署，验证每个必需的 Harness peer provider 均可解析，在可用时使用依赖自带的平台预编译件，并为 Electron ABI 重建其余原生依赖，最后将应用写入 `apps/desktop/out/`。未归档构建会把 pnpm 链接改写为包内相对目标，并拒绝任何逃逸应用包的链接；Windows 安装器构建使用 pnpm 的 hoisted 生产布局，避免 NSIS 跟随循环 peer 依赖链接图。打包后的后端通过 Electron 的 run-as-Node 模式运行，同时启用 Cordis HMR 所需的内部模块访问，并将 Harness home 存储在 Electron 的用户级应用数据目录下。

应用使用独立的社区项目图标：一条原创模块化鲸鱼，三个插件节点路由到中心 Harness 核心。它会让人联想到项目的 agent harness 用途，但不复制 DeepSeek 官方鲸鱼轮廓或标识。源 PNG 图稿以及打包使用的 macOS ICNS、Windows ICO 都位于 `apps/desktop/assets/`。

GitHub Actions 的 `desktop-release.yml` 会原生构建并冒烟测试四个目标：macOS arm64、macOS x64、Windows arm64 和 Windows x64。每条 lane 会保留面向用户的安装器（DMG 或 NSIS EXE）和一个便携 ZIP。推送 `desktop-v*` 标签会创建或更新同名 prerelease，并上传全部八个产物。

## 运行时与安全

renderer 会关闭 Node 集成，启用上下文隔离和 Chromium 沙箱，拒绝权限请求，阻止跨源导航，并使用显式响应 CSP。脚本策略允许 `unsafe-eval`，因为现有受信任同源的 [schema-form 客户端](../../packages/client/schema-form/README.md)会通过 `new Function` 复活 Host 编写的回调；该窗口绝不加载远程应用源。HTTP 和 WebSocket 流量均留在随机分配的 `127.0.0.1` 源。外部 HTTP(S) 链接会在操作系统浏览器中打开。

后端 stdout 与 stderr 会追加到 Electron 平台日志目录中的 `backend.log`。启动失败与意外退出对话框会包含该路径。

## 模型体验

应用会挂载现有 Web profile，因此面向模型的行为与 `dsh web` 相同，包括 Web GUI 定位信息和 `DSH_WEB_URL`。Electron 壳不会贡献额外模型输入。

ClawRouters 提供对话／视觉路由，以及生图、生视频和联网搜索工具。生成图片使用 DSH 标准附件解析器，会直接显示在工具卡片中，而不是展示原始 JSON。

#### KV Cache 影响

除现有 Web profile 外没有其他影响；该壳不会添加提示词段落或工具 schema。

## 已知限制与后续工作

- 该 MVP 复用 loopback HTTP／WebSocket 载体，而不是架构预留的 Electron IPC 载体。
- 安装器和便携包均未签名、未公证，并且没有自动更新器。CI 会为四种操作系统／CPU 目标生成原生 DMG／NSIS 安装器以及 ZIP 备用包，但签名仍属于独立的发布工作。
- 生产应用保持解包状态，不使用 ASAR 归档，使原生模块与可执行 helper 保留普通文件系统路径。普通未归档构建会把 pnpm 部署依赖图保留为包内相对符号链接；Windows 安装器构建则使用等价的 hoisted 生产依赖图，避免归档器循环遍历。
- 原生 Electron 对话框、系统凭证存储、托盘集成和多窗口行为不属于此壳的范围。
