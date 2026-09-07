import { api } from '../../convex/_generated/api'
import { type AdminConvexEnvironment, withAdminConvex, withAdminConvexWrite, AdminRequestError } from './admin-convex'

export type AdminSnapRouteEnvironment = AdminConvexEnvironment

const SNAP_LIST_LIMIT = 250

const UNABLE_TO_LOAD_SNAPS = 'Unable to load snaps.'

export function handleAdminSnapList(request: Request, environment: AdminSnapRouteEnvironment = {}) {
  const limit = Number(new URL(request.url).searchParams.get('limit'))

  return withAdminConvex(
    request,
    environment,
    (client) =>
      client.query(api.snaps.q.listForAdmin, {
        limit: Number.isSafeInteger(limit) && limit > 0 ? limit : SNAP_LIST_LIMIT
      }),
    UNABLE_TO_LOAD_SNAPS
  )
}

export function handleAdminSnapDetail(request: Request, snapId: string, environment: AdminSnapRouteEnvironment = {}) {
  return withAdminConvex(
    request,
    environment,
    (client) => client.query(api.snaps.q.getForAdminByRouteId, { snapId }),
    UNABLE_TO_LOAD_SNAPS
  )
}

export function handleAdminSnapHandlers(request: Request, environment: AdminSnapRouteEnvironment = {}) {
  if (request.method === 'GET') {
    return withAdminConvex(request, environment, client => client.query(api.snaps.handlers.options, {}), 'Unable to load handlers.')
  }
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 })
  return withAdminConvexWrite(request, environment, async client => {
    const body = await request.json() as { uploadId?: unknown; memberId?: unknown }
    if (!body || typeof body.uploadId !== 'string' || !(body.memberId === null || typeof body.memberId === 'string')) {
      throw new AdminRequestError('An upload ID and member ID (or null to clear) are required.')
    }
    return client.mutation(api.snaps.handlers.setHandler, {
      uploadId: body.uploadId,
      memberId: body.memberId as import('../../convex/_generated/dataModel').Id<'accountMembers'> | null
    })
  }, 'Unable to update the handler.')
}
