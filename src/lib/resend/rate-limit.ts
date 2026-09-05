export const RESEND_MAX_EMAILS_PER_SECOND = 2
export const RESEND_MIN_SEND_INTERVAL_MS = Math.ceil(1000 / RESEND_MAX_EMAILS_PER_SECOND)

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type RateLimiterOptions = {
  minIntervalMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export function createRateLimiter(options: RateLimiterOptions = {}) {
  const minIntervalMs = options.minIntervalMs ?? RESEND_MIN_SEND_INTERVAL_MS
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? delay

  let nextAllowedAt = 0
  let queue: Promise<void> = Promise.resolve()

  return async function runWithRateLimit<T>(task: () => Promise<T>): Promise<T> {
    const runTask = async () => {
      const waitMs = Math.max(0, nextAllowedAt - now())
      if (waitMs > 0) {
        await sleep(waitMs)
      }

      nextAllowedAt = now() + minIntervalMs
      return task()
    }

    const result = queue.then(runTask, runTask)
    queue = result.then(
      () => undefined,
      () => undefined
    )

    return result
  }
}

export const queueResendSend = createRateLimiter()
