import { AdminIdTokenError, mintAdminIdToken } from '@/lib/firebase-admin/admin-id-token'
import { getVerifiedAdminSession } from '@/lib/firebase-admin/server-auth'
import { createConvexClient } from './convex'

export interface AdminConvexEnvironment {
  convexUrl?: string
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

  try {
    const client = await getAdminConvexClient(request, environment)

    if (!client) return json({ error: 'Administrator access is required.' }, 401)

    return json(await run(client))
  } catch (error) {
    if (error instanceof AdminIdTokenError) {
      return json({ error: 'The administrator session could not be authenticated.' }, 500)
    }

    if (error instanceof Error && /Unauthorized|Unauthenticated/i.test(error.message)) {
      return json({ error: 'Administrator access is required.' }, 403)
    }

    return json({ error: readFailureMessage }, 500)
  }
}
