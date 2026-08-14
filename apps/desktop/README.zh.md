# @deepseek-ai/dsh-desktop

[English](README.md) | 中文

Electron 桌面应用是已交付 `dsh web` 组合的本地壳。它会让 Harness 后端在操作系统分配的 loopback 端口上启动，等待 CLI 的 `dsh web:` 就绪行，然后显示启用沙箱的应用窗口。关闭应用会向后端发送 `SIGTERM`，等待五秒让 Harness dispose（资源释放），并终止未能结算的子进程。

## 从 checkout 运行

安装依赖，然后启动桌面应用：

```sh
pnpm install
pnpm desktop:dev
```

该命令会先构建仓库，再启动 Electron。开发环境使用启动 pnpm 的 Node 可执行文件，因此现有原生 workspace 依赖会保持其 Node ABI。

桌面组合默认内置 [`dsh-plugin-clawrouters`](https://github.com/ropon/dsh-plugin-clawrouters)。全新 profile 的凭据引导会优先显示 ClawRouters，并通过现有凭据服务存储 `CLAWROUTERS_API_KEY`。只有未安装该插件路由时才回退到原生 DeepSeek 引导；用户也可以关闭引导，之后在「模型」中配置任意提供方。

设置 `DSH_DESKTOP_CWD` 可选择后端的初始文件系统位置。如果未设置，应用会使用当前用户的主目录；workspace 仍需在 UI 中明确选择。

## 打包

为当前操作系统与 CPU 架构构建应用：

```sh
pnpm desktop:package
```

打包脚本会创建隔离的生产部署，验证每个必需的 Harness peer provider 均可解析，为 Electron ABI 重建原生依赖，并将应用写入 `apps/desktop/out/`。它会把 pnpm 链接改写为包内相对目标，并拒绝任何逃逸应用包的链接。打包后的后端通过 Electron 的 run-as-Node 模式运行，同时启用 Cordis HMR 所需的内部模块访问，并将 Harness home 存储在 Electron 的用户级应用数据目录下。

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
- 构建包未签名、未公证，仅针对当前平台，并且没有自动更新器。
- 生产应用保持解包状态，不使用 ASAR 归档，使原生模块与可执行 helper 保留普通文件系统路径。打包会把 pnpm 部署依赖图保留为包内相对符号链接，而不是递归展开其中合法的对等依赖循环。
- 原生 Electron 对话框、系统凭证存储、托盘集成和多窗口行为不属于此壳的范围。
