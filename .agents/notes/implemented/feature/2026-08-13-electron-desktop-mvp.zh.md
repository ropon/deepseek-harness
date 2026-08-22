# Agent Note: 基于 loopback Web 载体的 Electron 桌面 MVP

Status: implemented

[English](2026-08-13-electron-desktop-mvp.md) | 中文

## Problem

`dsh web` 提供完整的图形化产品，但要求用户安装 Node.js、启动终端进程、保留其 URL 并负责其生命周期。可分发的桌面入口需要保留现有插件组合，同时负责启动、失败报告、关闭和原生依赖打包。

## Decision

[`apps/desktop`](../../../../apps/desktop/README.zh.md) 是已交付 Web profile 之上的 Electron 壳。它使用 `web --port 0` 启动已构建的 `dsh` CLI，只接受 CLI 的 loopback 就绪行，并在完整 Loader 配置树结算后加载该源。Electron 负责单一应用实例、后端子进程、合并日志、应用窗口和有界关闭。

renderer 仍是浏览器客户端：关闭 Node 集成，启用上下文隔离和沙箱，拒绝权限请求与跨源导航，并让外部 HTTP(S) 链接离开应用打开。显式 CSP 允许 `unsafe-eval`，唯一原因是受信任同源的 schema 与 Cordis 配置客户端会通过 `Function`／`eval` 执行 Host 编写的回调和表达式；该窗口绝不加载远程应用源。随机 loopback 源会保留 Web 载体的同源限制与特权方法限制。

桌面端持有一层排在用户 Web profile 之后的组合 patch。该 patch 通过绝对 package URL 绑定安装包内置的 `dsh-plugin-clawrouters`，而不修改用户 profile。共享 Models 引导会在这条路由存在时优先选择它，因此全新桌面会询问 `CLAWROUTERS_API_KEY`，原生 DeepSeek 凭据弹窗只作为回退。生图工具结果仍是标准附件 block；通用 Tool 行使用 conversation 图片 renderer，详情使用 Tool 持有的 `tool.details.result.images` slot。当前安装的附件展示插件在两处仍是唯一 renderer，并会收到 session 授权的加载器。

`0.1.1` 桌面版本跟随上游统一图片管线，不再携带早期的视觉兼容绕行。用户提交的图片会走当前的标准附件准入和提供方请求路径；工具返回图片只增加上文所述的缺失展示路由。

## Packaging

当前平台的打包命令会构建仓库，使用 `pnpm deploy --prod --legacy` 创建独立生产依赖树，验证已部署插件图中每个非 optional 的 `@deepseek-ai` peer provider 均可解析，为 Electron ABI 重建原生模块，再将该部署交给 Electron Packager。桌面 manifest 会显式提供组合层 peer provider；在 monorepo 开发安装中，这些 provider 原本由根级 hoist 暴露。生产环境通过 Electron 的 run-as-Node 模式运行 CLI，并带上 Cordis HMR 所需的 `--expose-internals`；开发环境通过 pnpm 的 Node 可执行文件运行 CLI，因此 workspace 安装不会被重建成偏离普通 Node ABI 的状态。

应用保持解包状态，不使用 ASAR，因为 Harness 依赖包含需要普通文件系统路径的原生模块和可执行 helper。普通未归档构建会在不展开合法 peer 循环的前提下保留生产部署的 pnpm 依赖图，再把 staging 绝对链接改写为包内相对目标，并验证每个链接都在应用内解析。Windows 安装器构建会请求 pnpm 生成等价的 hoisted 生产布局，使 NSIS 载荷归档器不会递归进入循环目录链接。代码签名、公证和更新属于发布分发工作，而不是启动行为。

仓库 CI 会在 GitHub 原生托管 runner 上分别打包 macOS arm64／x64 与 Windows arm64／x64。每条 lane 都会冒烟测试打包后的可执行文件，再把同一个预打包目录包装为面向用户的 DMG 或引导式 NSIS 安装器，并保留便携 ZIP 备用包；`desktop-v*` 标签会把全部八个产物汇聚到同一个 GitHub prerelease。应用会携带原创模块化鲸鱼图标的原生 ICNS／ICO 版本，该图标会让人联想到 Harness 用途，但不复制 DeepSeek 官方标识。

## Alternatives considered

**先实现预留的 IPC 载体。** 协议抽象支持它，但客户端模块图、流式事件、目录选择器与生产资源协议都会进入第一个交付版本。复用 loopback 可在验证产品需求期间，让 Web 组合及其测试继续作为权威；IPC 设计仍是深度桌面集成的目标。

**使用带 Node sidecar 的 Tauri。** Harness 仍需要 Node 运行时及其原生依赖闭包，因此这种方式会增加 Rust 壳和第二套打包系统，却无法移除 Node 部署。

**使用固定 loopback 端口。** 固定端口会与已有 Web 运行实例冲突，并使恢复依赖陈旧进程检测。端口零配合现有就绪行，可以让每个桌面生命周期获得唯一明确的后端。

## Consequences

桌面应用会共享 Web 行为，并能跟随上游 UI 变更，无需维护第二套 renderer。它也会保留本地 HTTP 与 WebSocket 进程、交付更大的 Electron 运行时，并且尚未提供原生 IPC、Keychain 存储、自动更新或已签名安装器。单元覆盖会固定分片就绪输出和启动失败；打包应用冒烟测试会验证部署依赖闭包与 Electron 持有的后端生命周期。
