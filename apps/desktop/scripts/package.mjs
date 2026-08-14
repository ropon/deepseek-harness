/** Build a current-platform Electron application from a pnpm production deployment. */

import { spawnSync } from 'node:child_process'
import { cp, glob, lstat, mkdir, readFile, readlink, readdir, rm, stat, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packager } from '@electron/packager'
import { rebuild } from '@electron/rebuild'
import { buildDesktopInstaller } from './installer.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(here, '..')
const repoRoot = resolve(appDir, '../..')
const stageDir = join(appDir, '.package-stage')
const outDir = join(appDir, 'out')
const require = createRequire(import.meta.url)
const electronVersion = require('electron/package.json').version
const pnpmEntrypoint = process.env.npm_execpath
const icon = process.platform === 'darwin'
  ? join(appDir, 'assets', 'icon.icns')
  : process.platform === 'win32'
    ? join(appDir, 'assets', 'icon.ico')
    : join(appDir, 'assets', 'icon.png')

async function collectSymlinks(directory) {
  const links = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) links.push(path)
    else if (entry.isDirectory()) links.push(...await collectSymlinks(path))
  }
  return links
}

function isWithin(parent, child) {
  const pathFromParent = relative(parent, child)
  return pathFromParent === '' || (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== '..')
}

async function makeDependencyLinksPortable(packagedAppDir) {
  const links = await collectSymlinks(packagedAppDir)
  const copiedWorkspaceTargets = new Map()

  for (const link of links) {
    const currentTarget = await readlink(link)
    if (!isAbsolute(currentTarget)) continue

    let portableTarget
    if (isWithin(stageDir, currentTarget)) {
      portableTarget = join(packagedAppDir, relative(stageDir, currentTarget))
    } else if (currentTarget === appDir) {
      portableTarget = packagedAppDir
    } else if (isWithin(repoRoot, currentTarget)) {
      const repoRelativeTarget = relative(repoRoot, currentTarget)
      portableTarget = join(packagedAppDir, '.workspace', repoRelativeTarget)
      if (!copiedWorkspaceTargets.has(currentTarget)) {
        await mkdir(dirname(portableTarget), { recursive: true })
        await cp(currentTarget, portableTarget, {
          recursive: true,
          force: true,
          filter(source) {
            const segments = relative(currentTarget, source).split(sep)
            return !segments.some(segment => ['.package-stage', 'node_modules', 'out'].includes(segment))
          },
        })
        copiedWorkspaceTargets.set(currentTarget, portableTarget)
      }
    } else {
      throw new Error(`desktop package: dependency link points outside the repository: ${currentTarget}`)
    }

    await rm(link)
    await symlink(relative(dirname(link), portableTarget), link)
  }

  for (const link of await collectSymlinks(packagedAppDir)) {
    const target = resolve(dirname(link), await readlink(link))
    if (!isWithin(packagedAppDir, target)) {
      throw new Error(`desktop package: non-portable dependency link remains: ${link} -> ${target}`)
    }
    await stat(target)
  }
}

function packagedResourcesDirectory(output) {
  if (process.platform === 'darwin') {
    return join(output, 'DSH Desktop.app', 'Contents', 'Resources', 'app')
  }
  return join(output, 'resources', 'app')
}

async function assertRequiredPeersResolvable() {
  const missing = new Set()
  const pattern = 'node_modules/.pnpm/*/node_modules/@deepseek-ai/*/package.json'

  for await (const relativeManifest of glob(pattern, { cwd: stageDir })) {
    const manifestPath = join(stageDir, relativeManifest)
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    for (const peerName of Object.keys(manifest.peerDependencies ?? {})) {
      if (!peerName.startsWith('@deepseek-ai/')) continue
      if (manifest.peerDependenciesMeta?.[peerName]?.optional === true) continue
      try {
        createRequire(manifestPath).resolve(`${peerName}/package.json`)
      } catch {
        missing.add(peerName)
      }
    }
  }

  if (missing.size > 0) {
    throw new Error(`desktop package: unresolved required peer dependencies:\n${[...missing].sort().join('\n')}`)
  }
}

if (pnpmEntrypoint === undefined || pnpmEntrypoint === '') {
  throw new Error('desktop package: npm_execpath is unavailable; run through pnpm desktop:package')
}

await rm(stageDir, { recursive: true, force: true })
const deployed = spawnSync(process.execPath, [
  pnpmEntrypoint,
  '--filter',
  '@deepseek-ai/dsh-desktop',
  'deploy',
  '--prod',
  '--legacy',
  stageDir,
], { cwd: repoRoot, stdio: 'inherit' })
if (deployed.status !== 0) throw new Error(`desktop package: pnpm deploy failed with ${String(deployed.status)}`)

await assertRequiredPeersResolvable()

await rebuild({
  buildPath: stageDir,
  electronVersion,
  arch: process.arch,
  force: true,
  // node-pty 1.1 ships native prebuilds for all four release targets,
  // including win32-arm64. Recompiling it is unnecessary and currently
  // fails in the native Windows ARM64 MSBuild environment.
  ignoreModules: ['node-pty'],
})

const outputs = await packager({
  dir: stageDir,
  out: outDir,
  overwrite: true,
  prune: false,
  asar: false,
  // The deployed pnpm graph contains legitimate peer cycles. Dereferencing
  // them turns the graph into recursive directory copies; retain its relative
  // links inside the unpacked application instead.
  derefSymlinks: false,
  electronVersion,
  platform: process.platform,
  arch: process.arch,
  name: 'DSH Desktop',
  executableName: 'DSH Desktop',
  appBundleId: 'io.github.ropon.dsh-desktop',
  appCategoryType: 'public.app-category.developer-tools',
  icon,
})

for (const output of outputs) {
  const packagedAppDir = packagedResourcesDirectory(output)
  await lstat(packagedAppDir)
  await makeDependencyLinksPortable(packagedAppDir)
  console.log(`desktop package: ${output}`)
  if (process.env.DSH_DESKTOP_BUILD_INSTALLER === '1') {
    const artifacts = await buildDesktopInstaller({ appDir, prepackaged: output })
    for (const artifact of artifacts) console.log(`desktop installer: ${artifact}`)
  }
}
