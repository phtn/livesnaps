import { api } from '../../convex/_generated/api'
import { type AdminConvexEnvironment, withAdminConvex } from './admin-convex'

export type AdminVerificationRouteEnvironment = AdminConvexEnvironment

const VERIFICATION_ENTRY_LIST_LIMIT = 250

export function handleAdminVerificationEntryList(
  request: Request,
  environment: AdminVerificationRouteEnvironment = {}
) {
  const limit = Number(new URL(request.url).searchParams.get('limit'))

  return withAdminConvex(
    request,
    environment,
    (client) =>
      client.query(api.verificationEntries.q.listAllForAdmin, {
        limit: Number.isSafeInteger(limit) && limit > 0 ? limit : VERIFICATION_ENTRY_LIST_LIMIT
      }),
    'Unable to load verification entries.'
  )
}
