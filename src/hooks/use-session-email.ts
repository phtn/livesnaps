import { useEffect, useState } from 'octane'

/**
 * The signed-in administrator's address, read from `/api/admin/session`.
 * `verificationEntries.m.create` derives the real sender from the Convex
 * identity; this is shown so the operator can see which account an entry will
 * be attributed to before committing. Stays empty on failure, which the create
 * drawer renders as a disabled submit rather than a broken page.
 */
export function useSessionEmail() {
  const [sessionEmail, setSessionEmail] = useState('')

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const response = await fetch('/api/admin/session', { credentials: 'same-origin' })
        if (!response.ok) return

        const payload: unknown = await response.json()
        const email =
          typeof payload === 'object' && payload !== null && typeof (payload as { email?: unknown }).email === 'string'
            ? (payload as { email: string }).email
            : ''

        if (!cancelled) setSessionEmail(email)
      } catch {
        // Left empty; see above.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return sessionEmail
}
