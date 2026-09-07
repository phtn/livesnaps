import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCaptureSettingsLoader } from './capture-settings'
import { DEFAULT_IMAGE_CAPTURE_SETTINGS } from './snap-settings'

const settings = { ...DEFAULT_IMAGE_CAPTURE_SETTINGS, updatedAt: null }

test('hundreds of simultaneous or repeated capture opens share one settings request', async () => {
  let calls = 0
  let now = 0
  let finish!: (value: typeof settings) => void
  const load = createCaptureSettingsLoader(() => {
    calls++
    return new Promise<typeof settings>(resolve => { finish = resolve })
  }, () => now, 100)
  const first = load()
  await Promise.resolve()
  now = 1000 // even a slow in-flight request is shared after the TTL
  for (let i = 0; i < 500; i++) assert.equal(load(), first)
  finish(settings)
  await first
  for (let i = 0; i < 500; i++) assert.equal(load(), first)
  assert.equal(calls, 1)
  now += 101
  const next = load()
  assert.notEqual(next, first)
  await Promise.resolve()
  assert.equal(calls, 2)
  finish(settings)
  await next
})

test('settings failures are cached too, preventing automatic retry storms', async () => {
  let calls = 0
  let now = 0
  const load = createCaptureSettingsLoader(async () => {
    calls++
    throw new Error('Offline')
  }, () => now, 100)
  for (let i = 0; i < 100; i++) await assert.rejects(load(), /Offline/)
  assert.equal(calls, 1)
  now = 101
  await assert.rejects(load(), /Offline/)
  assert.equal(calls, 2)
})
