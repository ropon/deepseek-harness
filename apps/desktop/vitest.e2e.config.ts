import { defineConfig } from 'vitest/config'

/** Isolated process lane for the real Electron application smoke. */
export default defineConfig({
  test: {
    include: ['tests/desktop.e2e.ts'],
    pool: 'forks',
    fileParallelism: false,
  },
})
