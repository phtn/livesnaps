import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'

export type CaptureSettings = FunctionReturnType<typeof api.snapSettings.q.get>

/** Settings are public and rarely change. Coalesce concurrent opens and cache
 * both successes and failures, so remounts cannot become a request/retry loop. */
export function createCaptureSettingsLoader(
  fetchSettings: () => Promise<CaptureSettings>,
  now: () => number = Date.now,
  maxAgeMs = 5 * 60_000
) {
  let cached: Promise<CaptureSettings> | undefined
  let expiresAt = 0
  let pending = false
  return () => {
    if (!cached || (!pending && now() >= expiresAt)) {
      pending = true
      cached = Promise.resolve().then(fetchSettings).finally(() => {
        pending = false
        expiresAt = now() + maxAgeMs
      })
    }
    return cached
  }
}
