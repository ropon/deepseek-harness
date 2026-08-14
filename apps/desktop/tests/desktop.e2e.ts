/** Real Electron smoke over the built CLI and Web frontend. */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'
import { afterEach, describe, expect, it } from 'vitest'

const appDir = resolve(import.meta.dirname, '..')
const repoRoot = resolve(appDir, '../..')
const packagedExecutable = process.env.DSH_DESKTOP_PACKAGED_EXECUTABLE
let temporaryRoot: string | undefined

afterEach(async () => {
  if (temporaryRoot === undefined) return
  await rm(temporaryRoot, { recursive: true, force: true })
  temporaryRoot = undefined
})

describe('desktop application', () => {
  it('opens the ready Web UI and shuts down its backend', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-desktop-e2e-'))
    const logDirectory = join(temporaryRoot, 'logs')
    const application = await electron.launch({
      ...packagedExecutable === undefined ? {} : { executablePath: packagedExecutable },
      args: packagedExecutable === undefined ? [appDir] : [],
      cwd: repoRoot,
      env: {
        ...process.env,
        DSH_DESKTOP_CWD: repoRoot,
        DSH_DESKTOP_DATA_DIR: join(temporaryRoot, 'data'),
        DSH_DESKTOP_LOG_DIR: logDirectory,
        npm_node_execpath: process.execPath,
      },
      timeout: 90_000,
    })
    try {
      const page = await application.firstWindow({ timeout: 90_000 })
      const pageErrors: string[] = []
      const consoleErrors: string[] = []
      const failedRequests: string[] = []
      page.on('pageerror', (error) => { pageErrors.push(error.message) })
      page.on('console', (message) => {
        if (message.type() === 'error' || message.type() === 'warning') consoleErrors.push(message.text())
      })
      page.on('requestfailed', (request) => {
        failedRequests.push(`${request.url()}: ${request.failure()?.errorText ?? 'unknown failure'}`)
      })
      await page.locator('#root').waitFor({ state: 'visible' })
      expect(new URL(page.url()).hostname).toBe('127.0.0.1')
      try {
        await expect.poll(
          async () => (await page.locator('body').innerText()).length,
          { timeout: 30_000, message: 'desktop renderer should produce visible text' },
        ).toBeGreaterThan(0)
      } catch (error) {
        throw new Error([
          'desktop renderer stayed empty',
          `root: ${await page.locator('#root').innerHTML()}`,
          `page errors: ${pageErrors.join('; ')}`,
          `console: ${consoleErrors.join('; ')}`,
          `failed requests: ${failedRequests.join('; ')}`,
        ].join('\n'), { cause: error })
      }
      const welcome = page.getByRole('dialog')
      await expect.poll(async () => welcome.innerText(), { timeout: 30_000 })
        .toMatch(/Internal Testing Notice|内测声明/u)
      await welcome.getByRole('button', { name: /Continue|继续/u }).click()

      const credential = page.getByRole('dialog')
      await expect.poll(async () => credential.innerText(), { timeout: 30_000 }).toContain('ClawRouters')
      expect(await credential.innerText()).not.toMatch(/official DeepSeek|DeepSeek 官方/u)
      await credential.getByRole('button', { name: /Configure later|稍后配置/u }).click()
      await expect.poll(async () => credential.count()).toBe(0)

      // The backend reached readiness with the desktop-owned standalone bundle
      // composed. Its materialized row points at this packaged installation,
      // while the user's ordinary Web profile stays untouched.
      const desktopPatch = await readFile(join(temporaryRoot, 'data', 'desktop-clawrouters.patch.yml'), 'utf8')
      expect(desktopPatch).toContain('clawrouters:')
      expect(desktopPatch).toMatch(/name: "file:\/\/.*dsh-plugin-clawrouters.*\/lib\/index\.js"/u)
      expect(pageErrors).toEqual([])
    } finally {
      await application.close()
    }
    await expect.poll(async () => readFile(join(logDirectory, 'backend.log'), 'utf8'))
      .toMatch(/dsh web: http:\/\/127\.0\.0\.1:\d+/u)
  }, 120_000)
})
