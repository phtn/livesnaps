import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CAPTURE_SETTINGS_CACHE_KEY,
  CAPTURE_SETTINGS_MAX_AGE_MS,
  createCaptureSettingsLoader
} from './capture-settings'
import { DEFAULT_IMAGE_CAPTURE_SETTINGS } from './snap-settings'

const settings = { ...DEFAULT_IMAGE_CAPTURE_SETTINGS, updatedAt: null }

const createStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => {
      values.delete(key)
    },
    setItem: (key: string, value: string) => {
      values.set(key, value)
    }
  }
}

test('hundreds of simultaneous or repeated capture opens share one settings request', async () => {
  let calls = 0
  let now = 0
  let finish!: (value: typeof settings) => void
  const load = createCaptureSettingsLoader(
    () => {
      calls++
      return new Promise<typeof settings>((resolve) => {
        finish = resolve
      })
    },
    () => now,
    100
  )
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
  const load = createCaptureSettingsLoader(
    async () => {
      calls++
      throw new Error('Offline')
    },
    () => now,
    100
  )
  for (let i = 0; i < 100; i++) await assert.rejects(load(), /Offline/)
  assert.equal(calls, 1)
  now = 101
  await assert.rejects(load(), /Offline/)
  assert.equal(calls, 2)
})

test('successful capture image parameters persist for 30 days across loaders', async () => {
  const storage = createStorage()
  let calls = 0
  let now = 1_000
  const firstLoader = createCaptureSettingsLoader(
    async () => {
      calls++
      return settings
    },
    () => now,
    CAPTURE_SETTINGS_MAX_AGE_MS,
    storage
  )

  assert.deepEqual(await firstLoader(), settings)
  const stored = JSON.parse(storage.getItem(CAPTURE_SETTINGS_CACHE_KEY) ?? '{}') as { expiresAt?: number }
  assert.equal(stored.expiresAt, now + 30 * 24 * 60 * 60_000)

  const secondLoader = createCaptureSettingsLoader(
    async () => {
      calls++
      return { ...settings, imageQuality: 0.5 }
    },
    () => now,
    CAPTURE_SETTINGS_MAX_AGE_MS,
    storage
  )
  assert.deepEqual(await secondLoader(), settings)
  assert.equal(calls, 1)

  now += CAPTURE_SETTINGS_MAX_AGE_MS
  assert.equal((await secondLoader()).imageQuality, 0.5)
  assert.equal(calls, 2)
})

test('invalid persisted parameters are discarded before querying fresh settings', async () => {
  const storage = createStorage()
  storage.setItem(
    CAPTURE_SETTINGS_CACHE_KEY,
    JSON.stringify({
      expiresAt: 10_000,
      settings: { ...settings, imageQuality: 2 }
    })
  )
  let calls = 0
  const load = createCaptureSettingsLoader(
    async () => {
      calls++
      return settings
    },
    () => 1_000,
    100,
    storage
  )

  assert.deepEqual(await load(), settings)
  assert.equal(calls, 1)
})
