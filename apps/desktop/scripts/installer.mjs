/** Build a native consumer installer around an already-packaged DSH Desktop app. */

import { build, createTargets, Platform } from 'electron-builder'
import { join } from 'node:path'

/**
 * Build the current platform and architecture's consumer installer without
 * repackaging the tested application directory.
 * @param {{ appDir: string, prepackaged: string }} options - desktop project and packaged application paths.
 * @returns {Promise<string[]>} emitted installer artifact paths.
 */
export async function buildDesktopInstaller({ appDir, prepackaged }) {
  const platform = process.platform === 'darwin'
    ? Platform.MAC
    : process.platform === 'win32'
      ? Platform.WINDOWS
      : undefined
  if (platform === undefined) {
    throw new Error(`desktop installer: unsupported platform ${process.platform}`)
  }

  const target = process.platform === 'darwin' ? 'dmg' : 'nsis'
  const installerInput = process.platform === 'darwin'
    ? join(prepackaged, 'DSH Desktop.app')
    : prepackaged
  return build({
    projectDir: appDir,
    prepackaged: installerInput,
    publish: 'never',
    targets: createTargets([platform], target, process.arch),
    config: {
      appId: 'io.github.ropon.dsh-desktop',
      productName: 'DSH Desktop',
      copyright: 'Copyright © 2026 DSH Desktop contributors',
      compression: 'normal',
      directories: {
        output: 'installers',
        buildResources: 'assets',
      },
      mac: {
        artifactName: 'DSH-Desktop-macOS-${arch}.${ext}',
        category: 'public.app-category.developer-tools',
        icon: 'assets/icon.icns',
        identity: null,
        hardenedRuntime: false,
        gatekeeperAssess: false,
        notarize: false,
      },
      dmg: {
        format: 'UDZO',
        icon: 'assets/icon.icns',
        iconSize: 112,
        window: { width: 540, height: 380 },
        contents: [
          { type: 'file', x: 140, y: 190 },
          { type: 'link', path: '/Applications', x: 400, y: 190 },
        ],
      },
      win: {
        artifactName: 'DSH-Desktop-Windows-${arch}.${ext}',
        icon: 'assets/icon.ico',
        verifyUpdateCodeSignature: false,
      },
      nsis: {
        oneClick: false,
        perMachine: false,
        // The unpacked pnpm deployment contains a large dependency graph.
        // ZIP avoids electron-builder's fixed ultra-compression 7z path while
        // preserving the same installed payload and assisted installer UX.
        useZip: true,
        allowToChangeInstallationDirectory: true,
        differentialPackage: false,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: 'DSH Desktop',
        uninstallDisplayName: 'DSH Desktop',
        installerIcon: 'assets/icon.ico',
        uninstallerIcon: 'assets/icon.ico',
      },
    },
  })
}
