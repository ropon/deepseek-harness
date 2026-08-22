/** Run the desktop package command with native installer output enabled. */

import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pnpmEntrypoint = process.env.npm_execpath
if (pnpmEntrypoint === undefined || pnpmEntrypoint === '') {
  throw new Error('desktop installer: npm_execpath is unavailable; run through pnpm desktop:installer')
}

const child = spawnSync(process.execPath, [pnpmEntrypoint, 'run', 'package'], {
  cwd: appDir,
  env: { ...process.env, DSH_DESKTOP_BUILD_INSTALLER: '1' },
  stdio: 'inherit',
})
if (child.status !== 0) throw new Error(`desktop installer: package command failed with ${String(child.status)}`)
