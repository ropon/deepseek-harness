# DSH Desktop

English | [中文](README.zh.md)

DSH Desktop is an unofficial community distribution and is not affiliated with or endorsed by DeepSeek. The Electron application is a local shell around the shipped `dsh web` composition. It starts the Harness backend on an operating-system-assigned loopback port, waits for the CLI's `dsh web:` readiness line, and then reveals a sandboxed application window. Closing the application sends the backend `SIGTERM`, waits five seconds for Harness disposal, and terminates a child that does not settle.

## Run from a checkout

Install dependencies, then start the desktop application:

```sh
pnpm install
pnpm desktop:dev
```

The command builds the repository before launching Electron. Development uses the Node executable that launched pnpm, so existing native workspace dependencies keep their Node ABI.

The desktop composition bundles [`dsh-plugin-clawrouters`](https://github.com/ropon/dsh-plugin-clawrouters). On a clean profile, the credential onboarding prefers ClawRouters and stores `CLAWROUTERS_API_KEY` through the existing credential service. The stock DeepSeek prompt remains the fallback only when the plugin route is absent; users can dismiss onboarding and configure any provider later in Models.

The bundled plugin follows the official [plugin basics](https://deepseek-harness.github.io/deepseek-harness/develop/basic/) and [publishing layout](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish/) conventions: it exports a Cordis `apply` module, declares service injection, ships a Schemastery `Config`, exposes standard rendered tool output, and identifies its bundle patch through `dsh.bundle.patch`. The desktop launcher materializes that patch and passes it as the documented final `--patch` layer, so the plugin remains independently installable instead of becoming hard-coded provider logic.

Set `DSH_DESKTOP_CWD` to choose the backend's initial filesystem location. Without it, the application uses the current user's home directory; workspaces remain explicitly selected in the UI.

## Package

Build an application for the current operating system and CPU architecture:

```sh
pnpm desktop:package
```

This writes the unpacked application under `apps/desktop/out/`. For a consumer installer, run:

```sh
pnpm desktop:installer
```

The installer command builds the exact same unpacked application, then wraps that tested directory with Electron Builder: a drag-to-Applications DMG on macOS or an assisted per-user NSIS EXE on Windows. Installer artifacts are written under `apps/desktop/installers/`; no second application repack changes the dependency graph between the smoke-tested executable and the installer payload.

The packaging script creates an isolated production deployment, verifies that every required Harness peer provider is resolvable, uses bundled platform prebuilds where available, rebuilds the remaining native dependencies for Electron's ABI, and writes the application under `apps/desktop/out/`. It rewrites pnpm links to package-relative targets and rejects any link that escapes the application. The packaged backend runs through Electron's run-as-Node mode with the internal-module access required by Cordis HMR, and stores its Harness home below Electron's per-user application-data directory.

The application uses an independent community-project icon: an original modular whale whose three plugin nodes route into a central Harness core. It evokes the project's agent-harness purpose without reproducing DeepSeek's official whale silhouette or mark. Source PNG artwork plus packaged macOS ICNS and Windows ICO assets live in `apps/desktop/assets/`.

GitHub Actions workflow `desktop-release.yml` builds and smoke-tests four native targets: macOS arm64, macOS x64, Windows arm64, and Windows x64. Each lane retains the consumer installer (DMG or NSIS EXE) and a portable ZIP. Pushing a `desktop-v*` tag creates or updates the matching prerelease and uploads all eight artifacts.

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
- Installers and portable packages are unsigned and not notarized, and have no automatic updater. CI produces native DMG/NSIS installers plus ZIP fallbacks for four OS/CPU targets; signing remains separate release work.
- The production application is unpacked rather than ASAR-archived so native modules and executable helpers retain ordinary filesystem paths. Packaging keeps the deployed pnpm graph as package-internal relative symbolic links instead of recursively expanding its legitimate peer-dependency cycles.
- Native Electron dialogs, system credential storage, tray integration, and multi-window behavior remain outside this shell.
