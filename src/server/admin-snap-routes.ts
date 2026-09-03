import { api } from '../../convex/_generated/api'
import { AdminIdTokenError, mintAdminIdToken } from '@/lib/firebase-admin/admin-id-token'
import { getVerifiedAdminSession } from '@/lib/firebase-admin/server-auth'
import { createConvexClient } from './convex'

export interface AdminSnapRouteEnvironment {
  convexUrl?: string
}

const SNAP_LIST_LIMIT = 250

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' }
  })

type AdminConvexClient = ReturnType<typeof createConvexClient>

async function getAdminConvexClient(
  request: Request,
  environment: AdminSnapRouteEnvironment
): Promise<AdminConvexClient | null> {
  const session = await getVerifiedAdminSession(request)

  if (!session) return null

  const idToken = await mintAdminIdToken(session.decodedToken.uid)

  return createConvexClient(idToken, environment.convexUrl)
}

async function withAdminConvex<T>(
  request: Request,
  environment: AdminSnapRouteEnvironment,
  run: (client: AdminConvexClient) => Promise<T>
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

    return json({ error: 'Unable to load snaps.' }, 500)
  }
}

export function handleAdminSnapList(request: Request, environment: AdminSnapRouteEnvironment = {}) {
  const limit = Number(new URL(request.url).searchParams.get('limit'))

  return withAdminConvex(request, environment, (client) =>
    client.query(api.snaps.q.listForAdmin, {
      limit: Number.isSafeInteger(limit) && limit > 0 ? limit : SNAP_LIST_LIMIT
    })
  )
}

export function handleAdminSnapDetail(request: Request, snapId: string, environment: AdminSnapRouteEnvironment = {}) {
  return withAdminConvex(request, environment, (client) =>
    client.query(api.snaps.q.getForAdminByRouteId, { snapId })
  )
}
