# Agent Note: Electron desktop MVP over the loopback Web carrier

Status: implemented

English | [中文](2026-08-13-electron-desktop-mvp.zh.md)

## Problem

`dsh web` provides the complete graphical product but requires a user to install Node.js, start a terminal process, retain its URL, and own its lifetime. A distributable desktop entry needs to preserve the existing plugin composition while owning startup, failure reporting, shutdown, and native-dependency packaging.

## Decision

[`apps/desktop`](../../../../apps/desktop/README.md) is an Electron shell over the shipped Web profile. It starts the built `dsh` CLI with `web --port 0`, accepts only the CLI's loopback readiness line, and loads that origin after the full Loader tree settles. Electron owns one application instance, the backend child, its combined log, the application window, and bounded shutdown.

The renderer remains a browser client: Node integration is disabled, context isolation and sandboxing are enabled, permissions and cross-origin navigation are denied, and external HTTP(S) links leave the application. The explicit CSP allows `unsafe-eval` only because the trusted same-origin schema and Cordis configuration clients execute Host-authored callbacks and expressions through `Function`/`eval`; the window never loads a remote application origin. The random loopback origin retains the Web carrier's same-origin and privileged-method fences.

Desktop owns one composition patch layered after the user's Web profile. That patch binds the bundled `dsh-plugin-clawrouters` installation by absolute package URL without mutating the profile. The shared Models onboarding prefers that route when it is installed, so a clean desktop asks for `CLAWROUTERS_API_KEY` and the stock DeepSeek credential prompt remains only a fallback. Generated-image tool results stay standard attachment blocks; the generic tool surfaces resolve and render those blocks through the conversation's attachment resolver.

## Packaging

The current-platform packaging command builds the repository, uses `pnpm deploy --prod --legacy` to create a standalone production dependency tree, verifies that every non-optional `@deepseek-ai` peer provider in the deployed plugin graph resolves, rebuilds native modules for Electron's ABI, and passes that deployment to Electron Packager. The desktop manifest explicitly supplies composition-level peer providers that the monorepo development install otherwise exposes through root hoisting. Production runs the CLI through Electron's run-as-Node mode with `--expose-internals`, which Cordis HMR requires; development runs it through pnpm's Node executable so the workspace installation is not rebuilt away from its ordinary Node ABI.

The application remains unpacked instead of using ASAR because Harness dependencies include native modules and executable helpers that require ordinary filesystem paths. Packager retains the production deployment's pnpm graph without dereferencing legitimate peer cycles, then rewrites staging-absolute links to package-internal relative targets and verifies that every link resolves inside the application. Signing, notarization, installers, and updates remain release-distribution work rather than startup behavior.

The repository CI packages on native GitHub-hosted runners for macOS arm64/x64 and Windows arm64/x64. Each lane smoke-tests the packaged executable and publishes a ZIP artifact; `desktop-v*` tags converge those four artifacts into one GitHub prerelease. The application carries platform-native ICNS/ICO forms of an original modular-whale icon that evokes the Harness purpose without reproducing DeepSeek's official mark.

## Alternatives considered

**Implement the reserved IPC carrier first.** The protocol abstraction supports it, but the client-module graph, streaming events, directory picker, and production resource protocol would all enter the first deliverable. Reusing loopback keeps the Web composition and its tests authoritative while product demand is validated; the IPC design remains the target for a deeper desktop integration.

**Use Tauri with a Node sidecar.** Harness still needs its Node runtime and native dependency closure, so this adds a Rust shell and a second packaging system without removing the Node deployment.

**Use a fixed loopback port.** A fixed port collides with an existing Web run and makes recovery depend on stale-process detection. Port zero plus the existing readiness line gives each desktop lifetime one unambiguous backend.

## Consequences

The desktop application shares Web behavior and can follow upstream UI changes without a second renderer. It also retains local HTTP and WebSocket processes, ships a larger Electron runtime, and does not yet provide native IPC, keychain storage, automatic updates, or signed installers. Unit coverage pins fragmented readiness output and startup failures; the packaged-application smoke verifies the deployed dependency closure and Electron-owned backend lifecycle.
