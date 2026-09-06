import { AdminIdTokenError, mintAdminIdToken } from '@/lib/firebase-admin/admin-id-token'
import { getVerifiedAdminSession } from '@/lib/firebase-admin/server-auth'
import { createConvexClient } from './convex'

export interface AdminConvexEnvironment {
  convexUrl?: string
}

/**
 * A malformed request body, raised from inside a `run` callback. It becomes a
 * 400 with this message, so a route can validate its own payload without
 * unwrapping the response plumbing.
 */
export class AdminRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminRequestError'
  }
}

export type AdminConvexClient = ReturnType<typeof createConvexClient>

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' }
  })

async function getAdminConvexClient(
  request: Request,
  environment: AdminConvexEnvironment
): Promise<AdminConvexClient | null> {
  const session = await getVerifiedAdminSession(request)

  if (!session) return null

  const idToken = await mintAdminIdToken(session.decodedToken.uid)

  return createConvexClient(idToken, environment.convexUrl)
}

/**
 * Runs an admin-only Convex read behind the admin session cookie.
 *
 * The browser on the admin origin has no Firebase client identity, so the
 * Worker re-mints an ID token server-side and calls Convex on its behalf.
 * `readFailureMessage` names the resource in the 500 body; every other status
 * describes the session rather than the resource, so those are shared.
 */
export async function withAdminConvex<T>(
  request: Request,
  environment: AdminConvexEnvironment,
  run: (client: AdminConvexClient) => Promise<T>,
  readFailureMessage: string
): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)

  return runAdminConvex(request, environment, run, readFailureMessage)
}

/**
 * The write counterpart. Same session and token-minting path, but POST-only and
 * with one extra guard: a read is safe to serve cross-origin, a mutation is not,
 * and the session cookie is `SameSite=Lax` rather than `Strict`.
 *
 * A Convex `ConvexError` carries a message written for the operator, so unlike a
 * read failure it is passed through to the caller rather than replaced with
 * `writeFailureMessage` — "Snap already used for verification" is the useful
 * thing to show, not "Unable to send".
 */
export async function withAdminConvexWrite<T>(
  request: Request,
  environment: AdminConvexEnvironment,
  run: (client: AdminConvexClient) => Promise<T>,
  writeFailureMessage: string
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const origin = request.headers.get('origin')
  if (origin !== null && origin !== new URL(request.url).origin) {
    return json({ error: 'Invalid request origin.' }, 403)
  }

  return runAdminConvex(request, environment, run, writeFailureMessage, true)
}

async function runAdminConvex<T>(
  request: Request,
  environment: AdminConvexEnvironment,
  run: (client: AdminConvexClient) => Promise<T>,
  failureMessage: string,
  passThroughErrorMessage = false
): Promise<Response> {
  try {
    const client = await getAdminConvexClient(request, environment)

    if (!client) return json({ error: 'Administrator access is required.' }, 401)

    return json(await run(client))
  } catch (error) {
    if (error instanceof AdminRequestError) {
      return json({ error: error.message }, 400)
    }

    if (error instanceof AdminIdTokenError) {
      return json({ error: 'The administrator session could not be authenticated.' }, 500)
    }

    if (error instanceof Error && /Unauthorized|Unauthenticated/i.test(error.message)) {
      return json({ error: 'Administrator access is required.' }, 403)
    }

    if (passThroughErrorMessage && error instanceof Error) {
      const message = extractConvexErrorMessage(error)
      if (message) return json({ error: message }, 400)
    }

    return json({ error: failureMessage }, 500)
  }
}

/**
 * A thrown `ConvexError` reaches the Worker as a plain `Error` whose message is
 * the whole server-side log line. The application message is the part after the
 * `Uncaught ConvexError:` marker and before the stack, so anything else — a
 * transport or runtime failure — falls back to the caller's own wording.
 */
function extractConvexErrorMessage(error: Error): string | null {
  const marker = /Uncaught ConvexError:\s*/.exec(error.message)
  if (!marker) return null

  const message = error.message.slice(marker.index + marker[0].length).split('\n')[0].trim()
  return message.length > 0 ? message.slice(0, 300) : null
}
