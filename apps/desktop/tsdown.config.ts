import { defineConfig } from 'tsdown'

/** Build the Electron main process without bundling Electron's runtime module. */
export default defineConfig({
  entry: ['lib/types/src/main.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  deps: { neverBundle: ['electron'] },
  fixedExtension: false,
  dts: false,
  clean: false,
})
