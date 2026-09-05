import { api } from '../../convex/_generated/api'
import { type AdminConvexEnvironment, withAdminConvex } from './admin-convex'

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
