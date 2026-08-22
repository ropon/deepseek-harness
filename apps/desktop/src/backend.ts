/**
 * Lifecycle owner for the local `dsh web` child process used by the Electron
 * application. The readiness line is the CLI's public startup signal; the
 * desktop process does not probe a partially composed HTTP server.
 * @module @deepseek-ai/dsh-desktop/backend
 */

import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { dirname } from 'node:path'
import type { Readable } from 'node:stream'

type BackendChild = ChildProcessByStdio<null, Readable, Readable>

/** Maximum CLI startup time before the desktop app reports a launch failure. */
const BACKEND_START_TIMEOUT_MS = 60_000

/** Graceful-shutdown time before the desktop app terminates the child. */
const BACKEND_STOP_TIMEOUT_MS = 5_000

/** A settled child-process exit. */
interface BackendExit {
  code: number | null
  signal: NodeJS.Signals | null
}

/** Options for launching the local Harness backend. */
export interface BackendLaunchOptions {
  executable: string
  executableArgs?: string[]
  cliEntry: string
  cwd: string
  env: NodeJS.ProcessEnv
  logPath: string
  /** Desktop-owned patch layer composed after the user's Web profile. */
  patchPath?: string
  startupTimeoutMs?: number
  stopTimeoutMs?: number
}

/** The running backend and its idempotent shutdown operation. */
export interface BackendHandle {
  url: URL
  pid: number | undefined
  exit: Promise<BackendExit>
  stop(): Promise<void>
}

/** Build the CLI argv, keeping launcher-owned patches before Web app flags. */
export function backendArguments(options: Pick<BackendLaunchOptions, 'executableArgs' | 'cliEntry' | 'patchPath'>): string[] {
  return [
    ...(options.executableArgs ?? []),
    options.cliEntry,
    'web',
    ...(options.patchPath === undefined ? [] : ['--patch', options.patchPath]),
    '--port',
    '0',
  ]
}

/** Incremental parser for the CLI readiness line, including split chunks. */
export class BackendReadinessParser {
  private output = ''

  /**
   * Consume output and return the first valid loopback readiness URL.
   * @param chunk - stdout bytes or text from the backend.
   * @returns the URL once present, otherwise `undefined`.
   */
  push(chunk: Buffer | string): URL | undefined {
    this.output = (this.output + chunk.toString()).slice(-64 * 1024)
    const match = /(?:^|\n)dsh web: (http:\/\/127\.0\.0\.1:\d+)/u.exec(this.output)
    if (match?.[1] === undefined) return undefined
    const url = new URL(match[1])
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port === '') return undefined
    return url
  }
}

/** Wait for the public `dsh web:` readiness line or an early process failure. */
export function waitForBackendReady(
  child: BackendChild,
  timeoutMs = BACKEND_START_TIMEOUT_MS,
): Promise<URL> {
  const parser = new BackendReadinessParser()
  return new Promise<URL>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`desktop backend did not become ready within ${String(timeoutMs)}ms`))
    }, timeoutMs)
    const onData = (chunk: Buffer): void => {
      const url = parser.push(chunk)
      if (url === undefined) return
      cleanup()
      resolve(url)
    }
    const onError = (error: Error): void => {
      cleanup()
      reject(error)
    }
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      cleanup()
      reject(new Error(`desktop backend exited before readiness (code=${String(code)}, signal=${String(signal)})`))
    }
    const cleanup = (): void => {
      clearTimeout(timeout)
      child.stdout.off('data', onData)
      child.off('error', onError)
      child.off('exit', onExit)
    }
    child.stdout.on('data', onData)
    child.once('error', onError)
    child.once('exit', onExit)
  })
}

function waitForExit(child: BackendChild): Promise<BackendExit> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode })
  }
  return new Promise((resolve) => {
    child.once('exit', (code, signal) => { resolve({ code, signal }) })
  })
}

async function stopChild(child: BackendChild, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = waitForExit(child)
  child.kill('SIGTERM')
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise<false>((resolve) => { setTimeout(() => { resolve(false) }, timeoutMs) }),
  ])
  if (graceful) return
  child.kill('SIGKILL')
  await exited
}

function endLog(log: WriteStream): Promise<void> {
  return new Promise((resolve) => { log.end(() => { resolve() }) })
}

/**
 * Launch `dsh web` on an OS-assigned port and retain its complete output log.
 * The returned stop operation coalesces concurrent callers and waits for both
 * the child and log stream to settle.
 * @param options - executable, CLI entry, persistence environment, and limits.
 * @returns the ready backend handle.
 */
export async function launchBackend(options: BackendLaunchOptions): Promise<BackendHandle> {
  mkdirSync(dirname(options.logPath), { recursive: true })
  const log = createWriteStream(options.logPath, { flags: 'a' })
  const child = spawn(options.executable, backendArguments(options), {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdout.pipe(log, { end: false })
  child.stderr.pipe(log, { end: false })
  const exit = waitForExit(child)
  let url: URL
  try {
    url = await waitForBackendReady(child, options.startupTimeoutMs)
  } catch (error) {
    await stopChild(child, options.stopTimeoutMs ?? BACKEND_STOP_TIMEOUT_MS)
    await endLog(log)
    throw error
  }
  let stopping: Promise<void> | undefined
  return {
    url,
    pid: child.pid,
    exit,
    stop() {
      stopping ??= stopChild(child, options.stopTimeoutMs ?? BACKEND_STOP_TIMEOUT_MS)
        .then(() => endLog(log))
      return stopping
    },
  }
}
