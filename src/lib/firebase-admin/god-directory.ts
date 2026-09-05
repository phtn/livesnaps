import type { UserRecord } from 'firebase-admin/auth'
import { listFirebaseUsers } from './admin-core'
import { toFirebaseAdminUserSummary, type FirebaseAdminUserSummary } from './admin-users'
import {
  canManageFirebaseAccessClaim,
  canReceiveFirebaseClaimGrant,
  canViewTopgFirebaseUser,
  isFirebaseCustomClaims,
  type FirebaseCustomClaims,
  type FirebaseManagedAccessClaimName
} from './custom-claims'

// Firebase Auth has no way to query users by custom claim and caps a single
// `listUsers` page at 1000, so every read here is a directory scan. The page
// budget stops one request from walking an unbounded directory; callers surface
// `truncated` so the UI can say the view is partial rather than imply it is
// complete.
export const FIREBASE_USER_PAGE_SIZE = 1000
export const FIREBASE_USER_SCAN_PAGE_BUDGET = 10
export const FIREBASE_USER_SEARCH_RESULT_LIMIT = 20

export type FirebaseUserScan = {
  scanned: number
  truncated: boolean
  users: FirebaseAdminUserSummary[]
}

export type ManagedClaimChangeTarget = {
  email: string | null
  emailVerified: boolean
  uid: string
}

export type ManagedClaimChangeDecision = { allowed: true } | { allowed: false; error: string; status: number }

export function normalizeUserSearchQuery(query: string) {
  return query.trim().toLowerCase()
}

export function matchesFirebaseUserSearch(user: FirebaseAdminUserSummary, normalizedQuery: string) {
  if (normalizedQuery.length === 0) return false

  return (
    user.uid.toLowerCase() === normalizedQuery ||
    (user.email?.toLowerCase().includes(normalizedQuery) ?? false) ||
    (user.displayName?.toLowerCase().includes(normalizedQuery) ?? false)
  )
}

export function readFirebaseCustomClaims(customClaims: UserRecord['customClaims']): FirebaseCustomClaims {
  return isFirebaseCustomClaims(customClaims) ? customClaims : {}
}

/**
 * Decides whether `actor` may flip a managed access claim on `target`.
 *
 * The rules come from `custom-claims.ts`: only a `topg` account can grant or
 * revoke `admin`/`god`, and a grant needs a verified email to land on. The
 * self-revoke guard is this module's own — it stops the last god locking
 * themselves out of the citadel.
 */
export function authorizeManagedClaimChange({
  actorClaims,
  actorUid,
  claim,
  enabled,
  target
}: {
  actorClaims: FirebaseCustomClaims
  actorUid: string
  claim: FirebaseManagedAccessClaimName
  enabled: boolean
  target: ManagedClaimChangeTarget
}): ManagedClaimChangeDecision {
  if (!canManageFirebaseAccessClaim(actorClaims, claim)) {
    return { allowed: false, error: `Changing \`${claim}\` access requires a top-god account.`, status: 403 }
  }

  if (!canViewTopgFirebaseUser(actorClaims, { topg: actorClaims.topg ?? false })) {
    return { allowed: false, error: 'Your account cannot manage this user.', status: 403 }
  }

  if (!enabled && target.uid === actorUid) {
    return { allowed: false, error: 'You cannot revoke your own access.', status: 409 }
  }

  if (enabled && !canReceiveFirebaseClaimGrant(target)) {
    return {
      allowed: false,
      error: 'This account needs a verified email address before it can be granted access.',
      status: 409
    }
  }

  return { allowed: true }
}

/**
 * Walks the Firebase user directory, keeping the users `match` accepts and that
 * `actorClaims` is allowed to see.
 */
export async function scanFirebaseUsers({
  actorClaims,
  limit,
  match
}: {
  actorClaims: FirebaseCustomClaims
  limit: number
  match: (user: FirebaseAdminUserSummary) => boolean
}): Promise<FirebaseUserScan> {
  const users: FirebaseAdminUserSummary[] = []
  let pageToken: string | undefined
  let pages = 0
  let scanned = 0

  do {
    const page = await listFirebaseUsers(FIREBASE_USER_PAGE_SIZE, pageToken)
    pages += 1
    scanned += page.users.length

    for (const record of page.users) {
      if (!canViewTopgFirebaseUser(actorClaims, readFirebaseCustomClaims(record.customClaims))) continue

      const summary = toFirebaseAdminUserSummary(record)
      if (!match(summary)) continue

      users.push(summary)
      if (users.length >= limit) return { scanned, truncated: true, users }
    }

    pageToken = page.pageToken

    if (pageToken && pages >= FIREBASE_USER_SCAN_PAGE_BUDGET) {
      return { scanned, truncated: true, users }
    }
  } while (pageToken)

  return { scanned, truncated: false, users }
}
