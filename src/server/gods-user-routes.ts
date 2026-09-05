import {
  getFirebaseAdminAuth,
  getFirebaseUserByUid,
  revokeFirebaseUserRefreshTokens,
  setFirebaseCustomUserClaims
} from '@/lib/firebase-admin/admin'
import { type FirebaseAdminUserSummary, toFirebaseAdminUserSummary } from '@/lib/firebase-admin/admin-users'
import {
  canManageFirebaseAccessClaim,
  type FirebaseManagedAccessClaimName,
  isFirebaseManagedAccessClaimName,
  updateFirebaseManagedAccessClaim
} from '@/lib/firebase-admin/custom-claims'
import {
  authorizeManagedClaimChange,
  FIREBASE_USER_SEARCH_RESULT_LIMIT,
  matchesFirebaseUserSearch,
  normalizeUserSearchQuery,
  readFirebaseCustomClaims,
  scanFirebaseUsers
} from '@/lib/firebase-admin/god-directory'
import { getVerifiedGodSession } from '@/lib/firebase-admin/server-auth'
import { getHostnameFromHostHeader } from '@/lib/routing/admin-subdomain'
import { isGodsSubdomainHostname } from '@/lib/routing/gods-subdomain'

export type GodsUserListResponse = {
  // The caller's own uid, so the UI can decline to offer an action the server
  // will refuse — self-revocation.
  actorUid: string
  canManage: boolean
  scanned: number
  truncated: boolean
  users: FirebaseAdminUserSummary[]
}

export type GodsUserClaimResponse = {
  user: FirebaseAdminUserSummary
}

// The whole `god` claim list is capped: it is a privileged roster, not a
// directory browser, and the scan behind it is not free.
const GOD_LIST_RESULT_LIMIT = 200

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...headers }
  })
}

function isGodsRequest(request: Request) {
  const hostname =
    getHostnameFromHostHeader(request.headers.get('x-forwarded-host') ?? request.headers.get('host')) ??
    new URL(request.url).hostname

  return isGodsSubdomainHostname(hostname)
}

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get('origin')
  return origin === null || origin === new URL(request.url).origin
}

/**
 * `GET /api/gods/users` — the current `god` roster.
 * `GET /api/gods/users?search=<query>` — candidates to grant the claim to.
 */
export async function handleGodsUsers(request: Request): Promise<Response> {
  if (!isGodsRequest(request)) return json({ error: 'Not found.' }, 404)
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)

  const session = await getVerifiedGodSession(request)
  if (!session) return json({ error: 'God access is required.' }, 401)
  if (!getFirebaseAdminAuth()) return json({ error: 'Firebase Admin credentials are not configured.' }, 503)

  const actorClaims = session.customClaims
  const rawSearch = new URL(request.url).searchParams.get('search')
  const search = normalizeUserSearchQuery(rawSearch ?? '')

  try {
    // No search term means "who currently holds god"; a search term means
    // "who could be granted it", so the whole directory is in scope.
    const scan =
      rawSearch === null
        ? await scanFirebaseUsers({ actorClaims, limit: GOD_LIST_RESULT_LIMIT, match: (user) => user.god })
        : search.length === 0
          ? { scanned: 0, truncated: false, users: [] }
          : await scanFirebaseUsers({
              actorClaims,
              limit: FIREBASE_USER_SEARCH_RESULT_LIMIT,
              match: (user) => matchesFirebaseUserSearch(user, search)
            })

    const body: GodsUserListResponse = {
      actorUid: session.decodedToken.uid,
      canManage: canManageFirebaseAccessClaim(actorClaims, 'god'),
      scanned: scan.scanned,
      truncated: scan.truncated,
      users: scan.users
    }

    return json(body)
  } catch {
    return json({ error: 'Could not read the Firebase user directory.' }, 502)
  }
}

/**
 * `POST /api/gods/users/claims` — grant or revoke a managed access claim.
 * Body: `{ uid: string, claim: 'admin' | 'god', enabled: boolean }`.
 */
export async function handleGodsUserClaims(request: Request): Promise<Response> {
  if (!isGodsRequest(request)) return json({ error: 'Not found.' }, 404)
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  if (!isSameOriginRequest(request)) return json({ error: 'Invalid request origin.' }, 403)

  const session = await getVerifiedGodSession(request)
  if (!session) return json({ error: 'God access is required.' }, 401)
  if (!getFirebaseAdminAuth()) return json({ error: 'Firebase Admin credentials are not configured.' }, 503)

  let payload: { claim?: unknown; enabled?: unknown; uid?: unknown }
  try {
    const body: unknown = await request.json()
    payload = typeof body === 'object' && body !== null ? (body as typeof payload) : {}
  } catch {
    return json({ error: 'A valid JSON request body is required.' }, 400)
  }

  const { claim, enabled, uid } = payload

  if (typeof uid !== 'string' || uid.trim().length === 0) return json({ error: 'A Firebase uid is required.' }, 400)
  if (typeof enabled !== 'boolean') return json({ error: '`enabled` must be a boolean.' }, 400)
  if (!isFirebaseManagedAccessClaimName(claim)) {
    return json({ error: '`claim` must be a managed access claim.' }, 400)
  }

  const managedClaim: FirebaseManagedAccessClaimName = claim
  const actorClaims = session.customClaims

  // Refuse before reading the directory, in both directions: a god who is not
  // topg can neither grant nor revoke, and should not be able to probe uids for
  // existence on the way to finding that out. `authorizeManagedClaimChange`
  // checks this again once the target is loaded.
  if (!canManageFirebaseAccessClaim(actorClaims, managedClaim)) {
    return json({ error: `Changing \`${managedClaim}\` access requires a top-god account.` }, 403)
  }

  let target
  try {
    target = await getFirebaseUserByUid(uid)
  } catch {
    return json({ error: 'That user could not be found.' }, 404)
  }

  const targetClaims = readFirebaseCustomClaims(target.customClaims)

  const decision = authorizeManagedClaimChange({
    actorClaims,
    actorUid: session.decodedToken.uid,
    claim: managedClaim,
    enabled,
    target: {
      claims: targetClaims,
      email: target.email ?? null,
      emailVerified: target.emailVerified,
      uid: target.uid
    }
  })

  if (!decision.allowed) return json({ error: decision.error }, decision.status)

  try {
    await setFirebaseCustomUserClaims(target.uid, updateFirebaseManagedAccessClaim(targetClaims, managedClaim, enabled))
    // Claims are baked into the ID token, so an unrevoked session keeps the old
    // access until it expires on its own.
    await revokeFirebaseUserRefreshTokens(target.uid)

    const body: GodsUserClaimResponse = { user: toFirebaseAdminUserSummary(await getFirebaseUserByUid(target.uid)) }
    return json(body)
  } catch {
    return json({ error: 'Could not update this account’s access.' }, 502)
  }
}
