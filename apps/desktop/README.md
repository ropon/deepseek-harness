# @deepseek-ai/dsh-desktop

English | [中文](README.zh.md)

The Electron desktop application is a local shell around the shipped `dsh web` composition. It starts the Harness backend on an operating-system-assigned loopback port, waits for the CLI's `dsh web:` readiness line, and then reveals a sandboxed application window. Closing the application sends the backend `SIGTERM`, waits five seconds for Harness disposal, and terminates a child that does not settle.

## Run from a checkout

Install dependencies, then start the desktop application:

```sh
pnpm install
pnpm desktop:dev
```

The command builds the repository before launching Electron. Development uses the Node executable that launched pnpm, so existing native workspace dependencies keep their Node ABI.

The desktop composition bundles [`dsh-plugin-clawrouters`](https://github.com/ropon/dsh-plugin-clawrouters). On a clean profile, the credential onboarding prefers ClawRouters and stores `CLAWROUTERS_API_KEY` through the existing credential service. The stock DeepSeek prompt remains the fallback only when the plugin route is absent; users can dismiss onboarding and configure any provider later in Models.

Set `DSH_DESKTOP_CWD` to choose the backend's initial filesystem location. Without it, the application uses the current user's home directory; workspaces remain explicitly selected in the UI.

## Package

Build an application for the current operating system and CPU architecture:

```sh
pnpm desktop:package
```

The packaging script creates an isolated production deployment, verifies that every required Harness peer provider is resolvable, rebuilds native dependencies for Electron's ABI, and writes the application under `apps/desktop/out/`. It rewrites pnpm links to package-relative targets and rejects any link that escapes the application. The packaged backend runs through Electron's run-as-Node mode with the internal-module access required by Cordis HMR, and stores its Harness home below Electron's per-user application-data directory.

## Runtime and security

The renderer has Node integration disabled, context isolation and the Chromium sandbox enabled, denied permission requests, blocked cross-origin navigation, and an explicit response CSP. The script policy permits `unsafe-eval` because the existing trusted same-origin [schema-form client](../../packages/client/schema-form/README.md) revives Host-authored callbacks through `new Function`; the window never loads a remote application origin. HTTP and WebSocket traffic stay on the randomly assigned `127.0.0.1` origin. External HTTP(S) links open in the operating system browser.

Backend stdout and stderr append to `backend.log` in Electron's platform log directory. Startup and unexpected-exit dialogs include that path.

## Model Experience

The application mounts the existing Web profile, so model-visible behavior is the same as `dsh web`, including the Web GUI orientation and `DSH_WEB_URL`. The Electron shell contributes no additional model input.

ClawRouters contributes chat/vision routing plus image generation, video generation, and Web-search tools. Generated image attachment blocks use the standard DSH attachment resolver and render inline rather than as raw JSON.

#### KV Cache effect

None beyond the existing Web profile; the shell adds no prompt section or tool schema.

## Known Limitations and Deferred Work

- The MVP reuses the loopback HTTP/WebSocket carrier instead of the architecture's reserved Electron IPC carrier.
- Packages are unsigned, not notarized, current-platform only, and have no automatic updater.
- The production application is unpacked rather than ASAR-archived so native modules and executable helpers retain ordinary filesystem paths. Packaging keeps the deployed pnpm graph as package-internal relative symbolic links instead of recursively expanding its legitimate peer-dependency cycles.
- Native Electron dialogs, system credential storage, tray integration, and multi-window behavior remain outside this shell.
