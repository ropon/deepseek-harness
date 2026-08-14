import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { backendArguments, BackendReadinessParser, waitForBackendReady } from '../src/backend.ts'

function fakeChild(): { child: Parameters<typeof waitForBackendReady>[0]; stdout: PassThrough } {
  const child = new EventEmitter()
  const stdout = new PassThrough()
  Object.assign(child, {
    stdout,
    stderr: new PassThrough(),
    stdin: null,
    kill: vi.fn(),
  })
  Object.defineProperties(child, {
    exitCode: { value: null, writable: true },
    signalCode: { value: null, writable: true },
  })
  return { child: child as Parameters<typeof waitForBackendReady>[0], stdout }
}

describe('desktop backend readiness', () => {
  it('composes the bundled plugin patch before Web app arguments', () => {
    expect(backendArguments({
      executableArgs: ['--expose-internals'],
      cliEntry: '/app/dsh/bin.js',
      patchPath: '/app/plugins/clawrouters/cordis.patch.yml',
    })).toEqual([
      '--expose-internals',
      '/app/dsh/bin.js',
      'web',
      '--patch',
      '/app/plugins/clawrouters/cordis.patch.yml',
      '--port',
      '0',
    ])
  })

  it('parses a readiness URL split across output chunks', () => {
    const parser = new BackendReadinessParser()
    expect(parser.push('booting\ndsh web: http://127.')).toBeUndefined()
    expect(parser.push('0.0.1:43123 (LAN: http://10.0.0.2:43123)\n')?.href)
      .toBe('http://127.0.0.1:43123/')
  })

  it('ignores non-loopback and malformed output', () => {
    const parser = new BackendReadinessParser()
    expect(parser.push('dsh web: http://0.0.0.0:3080\n')).toBeUndefined()
    expect(parser.push('unrelated output\n')).toBeUndefined()
  })

  it('waits for readiness and removes startup listeners', async () => {
    const { child, stdout } = fakeChild()
    const ready = waitForBackendReady(child, 100)
    stdout.write('dsh web: http://127.0.0.1:39001\n')
    await expect(ready).resolves.toEqual(new URL('http://127.0.0.1:39001'))
    expect(child.stdout.listenerCount('data')).toBe(0)
    expect(child.listenerCount('exit')).toBe(0)
  })

  it('reports an early process exit', async () => {
    const { child } = fakeChild()
    const ready = waitForBackendReady(child, 100)
    child.emit('exit', 2, null)
    await expect(ready).rejects.toThrow('exited before readiness')
  })

  it('reports spawn errors and startup timeouts', async () => {
    const { child: failedChild } = fakeChild()
    const failed = waitForBackendReady(failedChild, 100)
    failedChild.emit('error', new Error('spawn failed'))
    await expect(failed).rejects.toThrow('spawn failed')

    vi.useFakeTimers()
    const { child: timedOutChild } = fakeChild()
    const timedOut = waitForBackendReady(timedOutChild, 5)
    const rejection = expect(timedOut).rejects.toThrow('did not become ready within 5ms')
    await vi.advanceTimersByTimeAsync(5)
    await rejection
    vi.useRealTimers()
  })
})
