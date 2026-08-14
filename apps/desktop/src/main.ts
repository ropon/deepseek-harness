/** Electron application shell for the local DeepSeek Harness Web UI. */

/* v8 ignore file -- the packaged desktop smoke owns Electron lifecycle behavior. */

import { dirname, join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, Menu, session, shell } from 'electron'
import type { MessageBoxOptions } from 'electron'
import { launchBackend, type BackendHandle } from './backend.ts'

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // The trusted same-origin client revives Host-authored schema callbacks and
  // Cordis config expressions through Function/eval. The schema-form package
  // owns that executable-envelope contract; no remote renderer content loads.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ')

let mainWindow: BrowserWindow | undefined
let backend: BackendHandle | undefined
let quitting = false
let quitTask: Promise<void> | undefined

/** Bind the standalone bundle's self row to its packaged absolute module. */
export function materializeDesktopPluginPatch(source: string, pluginEntry: string): string {
  const marker = 'name: dsh-plugin-clawrouters'
  if (!source.includes(marker)) throw new Error(`desktop plugin patch is missing ${marker}`)
  return source.replace(marker, `name: ${JSON.stringify(pathToFileURL(pluginEntry).href)}`)
}

/** Resolve and materialize the bundled ClawRouters layer for this installation. */
function clawRoutersPatch(): string {
  const require = createRequire(import.meta.url)
  const manifest = require.resolve('dsh-plugin-clawrouters/package.json')
  const pluginDir = dirname(manifest)
  const source = readFileSync(join(pluginDir, 'cordis.patch.yml'), 'utf8')
  const target = join(app.getPath('userData'), 'desktop-clawrouters.patch.yml')
  writeFileSync(target, materializeDesktopPluginPatch(source, join(pluginDir, 'lib', 'index.js')))
  return target
}

function cliEntry(): string {
  if (app.isPackaged) return join(app.getAppPath(), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  return fileURLToPath(new URL('../../cli/lib/bin.js', import.meta.url))
}

function backendExecutable(): { executable: string; executableArgs: string[]; runAsElectronNode: boolean } {
  if (app.isPackaged) {
    return { executable: process.execPath, executableArgs: ['--expose-internals'], runAsElectronNode: true }
  }
  return {
    executable: process.env.npm_node_execpath ?? 'node',
    executableArgs: [],
    runAsElectronNode: false,
  }
}

function focusMainWindow(): void {
  if (mainWindow === undefined) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function installSessionPolicy(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => { callback(false) })
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CONTENT_SECURITY_POLICY],
      },
    })
  })
}

function createMainWindow(url: URL): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#111111',
    title: 'DeepSeek Harness',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  const allowedOrigin = url.origin
  window.webContents.on('will-navigate', (event, target) => {
    if (new URL(target).origin !== allowedOrigin) event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    const external = new URL(target)
    if (external.protocol === 'https:' || external.protocol === 'http:') void shell.openExternal(external.href)
    return { action: 'deny' }
  })
  window.once('ready-to-show', () => { window.show() })
  window.on('closed', () => { mainWindow = undefined })
  void window.loadURL(url.href)
  return window
}

async function shutdownAndExit(code: number): Promise<void> {
  if (quitTask !== undefined) return quitTask
  quitting = true
  quitTask = (async () => {
    await backend?.stop()
    backend = undefined
    app.exit(code)
  })()
  return quitTask
}

async function showStartupFailure(error: unknown): Promise<void> {
  const logPath = join(app.getPath('logs'), 'backend.log')
  await dialog.showMessageBox({
    type: 'error',
    title: 'DeepSeek Harness failed to start',
    message: 'The local Harness backend could not be started.',
    detail: `${error instanceof Error ? error.message : String(error)}\n\nBackend log: ${logPath}`,
    buttons: ['Quit'],
  })
}

async function start(): Promise<void> {
  app.setAppLogsPath(process.env.DSH_DESKTOP_LOG_DIR)
  installSessionPolicy()
  Menu.setApplicationMenu(null)
  const runtime = backendExecutable()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DSH_HOME: join(app.getPath('userData'), 'harness'),
    DSH_DESKTOP: '1',
    ...(runtime.runAsElectronNode ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
  }
  backend = await launchBackend({
    executable: runtime.executable,
    executableArgs: runtime.executableArgs,
    cliEntry: cliEntry(),
    cwd: process.env.DSH_DESKTOP_CWD ?? app.getPath('home'),
    env,
    logPath: join(app.getPath('logs'), 'backend.log'),
    patchPath: clawRoutersPatch(),
  })
  mainWindow = createMainWindow(backend.url)
  void backend.exit.then(async ({ code, signal }) => {
    if (quitting) return
    const options: MessageBoxOptions = {
      type: 'error',
      title: 'DeepSeek Harness stopped',
      message: 'The local Harness backend exited unexpectedly.',
      detail: `code=${String(code)}, signal=${String(signal)}\n\nBackend log: ${join(app.getPath('logs'), 'backend.log')}`,
      buttons: ['Quit'],
    }
    if (mainWindow === undefined) await dialog.showMessageBox(options)
    else await dialog.showMessageBox(mainWindow, options)
    await shutdownAndExit(1)
  })
}

async function bootstrap(): Promise<void> {
  try {
    await app.whenReady()
    await start()
  } catch (error) {
    await showStartupFailure(error)
    await shutdownAndExit(1)
  }
}

const dataDirectory = process.env.DSH_DESKTOP_DATA_DIR
if (dataDirectory !== undefined && dataDirectory !== '') {
  mkdirSync(dataDirectory, { recursive: true })
  app.setPath('userData', dataDirectory)
}

const ownsInstance = app.requestSingleInstanceLock()
if (!ownsInstance) {
  app.quit()
} else {
  app.on('second-instance', focusMainWindow)
  app.on('activate', focusMainWindow)
  app.on('window-all-closed', () => { void shutdownAndExit(0) })
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    void shutdownAndExit(0)
  })
  void bootstrap()
}
