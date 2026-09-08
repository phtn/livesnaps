import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { getSnapSettingsValidationError } from './snap-settings'

export type CaptureSettings = FunctionReturnType<typeof api.snapSettings.q.get>

export const CAPTURE_SETTINGS_CACHE_KEY = 'capture-session-image-params'
export const CAPTURE_SETTINGS_MAX_AGE_MS = 30 * 24 * 60 * 60_000
const CAPTURE_SETTINGS_FAILURE_MAX_AGE_MS = 5 * 60_000

type CaptureSettingsStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>

type StoredCaptureSettings = {
  expiresAt: number
  settings: CaptureSettings
}

const getDefaultStorage = (): CaptureSettingsStorage | undefined => {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

const isCaptureSettings = (value: unknown): value is CaptureSettings => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const settings = value as Partial<CaptureSettings>
  return (
    (settings.updatedAt === null || typeof settings.updatedAt === 'number') &&
    !getSnapSettingsValidationError(settings as CaptureSettings)
  )
}

const readStoredSettings = (
  storage: CaptureSettingsStorage | undefined,
  now: number
): StoredCaptureSettings | undefined => {
  if (!storage) return undefined
  try {
    const raw = storage.getItem(CAPTURE_SETTINGS_CACHE_KEY)
    if (!raw) return undefined
    const stored = JSON.parse(raw) as Partial<StoredCaptureSettings>
    if (typeof stored.expiresAt !== 'number' || stored.expiresAt <= now || !isCaptureSettings(stored.settings)) {
      storage.removeItem(CAPTURE_SETTINGS_CACHE_KEY)
      return undefined
    }
    return stored as StoredCaptureSettings
  } catch {
    try {
      storage.removeItem(CAPTURE_SETTINGS_CACHE_KEY)
    } catch {
      // Treat inaccessible browser storage as an empty cache.
    }
    return undefined
  }
}

const storeSettings = (storage: CaptureSettingsStorage | undefined, settings: CaptureSettings, expiresAt: number) => {
  if (!storage) return
  try {
    storage.setItem(CAPTURE_SETTINGS_CACHE_KEY, JSON.stringify({ expiresAt, settings } satisfies StoredCaptureSettings))
  } catch {
    // Storage may be disabled or full. The in-memory cache still prevents repeat requests.
  }
}

/** Settings are public and rarely change. Coalesce concurrent opens, persist
 * successful image parameters across reloads, and cache failures in memory. */
export function createCaptureSettingsLoader(
  fetchSettings: () => Promise<CaptureSettings>,
  now: () => number = Date.now,
  maxAgeMs = CAPTURE_SETTINGS_MAX_AGE_MS,
  storage: CaptureSettingsStorage | undefined = getDefaultStorage()
) {
  let cached: Promise<CaptureSettings> | undefined
  let expiresAt = 0
  let pending = false
  return () => {
    if (!cached) {
      const stored = readStoredSettings(storage, now())
      if (stored) {
        expiresAt = stored.expiresAt
        cached = Promise.resolve(stored.settings)
      }
    }
    if (!cached || (!pending && now() >= expiresAt)) {
      pending = true
      cached = Promise.resolve()
        .then(fetchSettings)
        .then((settings) => {
          expiresAt = now() + maxAgeMs
          storeSettings(storage, settings, expiresAt)
          return settings
        })
        .catch((error: unknown) => {
          // Avoid a retry storm during this runtime without persisting a transient failure.
          expiresAt = now() + Math.min(maxAgeMs, CAPTURE_SETTINGS_FAILURE_MAX_AGE_MS)
          throw error
        })
        .finally(() => {
          pending = false
        })
    }
    return cached
  }
}
