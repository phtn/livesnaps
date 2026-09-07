import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { getFirebaseAdminAuth, getFirebaseUserByUid, setFirebaseCustomUserClaims } from '@/lib/firebase-admin/admin'
import { clearAdminIdTokenCache, mintAdminIdToken } from '@/lib/firebase-admin/admin-id-token'
import { updateFirebaseManagedAccessClaim } from '@/lib/firebase-admin/custom-claims'
import { readFirebaseCustomClaims } from '@/lib/firebase-admin/god-directory'
import { revokeAccountAdminClaim } from '@/lib/firebase-admin/account-admin-access'
import { createConvexClient, RequestError } from './convex'

const dependencies = {
  revokeAdmin: revokeAccountAdminClaim,
  createClient: createConvexClient,
  async mintToken(uid: string) {
    clearAdminIdTokenCache(uid)
    return mintAdminIdToken(uid)
  },
  async verifyIdentity(token: string) {
    const auth = getFirebaseAdminAuth()
    if (!auth) throw new RequestError(503, 'Account confirmation is temporarily unavailable.')
    const identity = await auth.verifyIdToken(token, true).catch(() => null)
    if (!identity?.email || identity.email_verified !== true) {
      throw new RequestError(401, 'Sign in with your verified contact email to confirm admin access.')
    }
    return { uid: identity.uid, email: identity.email }
  },
  async grantAdmin(uid: string, email: string) {
    const user = await getFirebaseUserByUid(uid)
    if (user.disabled || !user.emailVerified || user.email?.toLowerCase() !== email.toLowerCase()) {
      throw new RequestError(403, 'Sign in with your verified contact email to confirm admin access.')
    }
    const claims = readFirebaseCustomClaims(user.customClaims)
    if (claims.admin !== true) {
      // The god-created provisioning record and the contact's consent authorize
      // this grant. Ordinary membership invites cannot enter this path.
      await setFirebaseCustomUserClaims(uid, updateFirebaseManagedAccessClaim(claims, 'admin', true))
      return true
    }
    return false
  }
}

export function createAccountConfirmationHandler(deps = dependencies) {
  return async (request: Request, environment: { convexUrl?: string } = {}): Promise<Response> => {
    const json = (body: unknown, status = 200) =>
      Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'Invalid request origin.' }, 403)
    const token = request.headers
      .get('authorization')
      ?.match(/^Bearer (.+)$/)?.[1]
      ?.trim()
    if (!token) return json({ error: 'Sign in to confirm admin access.' }, 401)
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: 'A valid JSON body is required.' }, 400)
    }
    const accountId = typeof body === 'object' && body !== null && 'accountId' in body ? body.accountId : null
    if (typeof accountId !== 'string' || !accountId) return json({ error: 'An account is required.' }, 400)
    try {
      const identity = await deps.verifyIdentity(token)
      const client = deps.createClient(token, environment.convexUrl)
      const member = await client.mutation(api.accountMembers.m.confirmAdminAccess, {
        accountId: accountId as Id<'accounts'>
      })
      // A completed confirmation must never restore a subsequently revoked claim.
      if (member.adminConfirmation === 'complete') return json({ confirmed: true })
      const newlyGranted = await deps.grantAdmin(identity.uid, identity.email)
      try {
        const freshClient = deps.createClient(await deps.mintToken(identity.uid), environment.convexUrl)
        await freshClient.mutation(api.accountMembers.m.completeAdminConfirmation, {
          accountId: accountId as Id<'accounts'>
        })
      } catch (failure) {
        // A god may revoke while the Firebase write is in flight. Undo a grant
        // made by this request if the confirmation was disabled in the meantime.
        if (newlyGranted) {
          const current = await client.query(api.accountMembers.q.getMine, { accountId: accountId as Id<'accounts'> })
          if (current?.adminConfirmation && ['cancelled', 'revoking', 'revoked'].includes(current.adminConfirmation)) {
            await deps.revokeAdmin(identity.uid)
          }
        }
        throw failure
      }
      return json({ confirmed: true })
    } catch (error) {
      if (error instanceof RequestError) return json({ error: error.message }, error.status)
      const message = error instanceof Error ? /Uncaught ConvexError:\s*(.+?)(?:\n|$)/.exec(error.message)?.[1] : null
      if (message) return json({ error: message }, 403)
      return json({ error: 'Could not finish confirming admin access. Please try again.' }, 500)
    }
  }
}

export const handleAccountAdminConfirmation = createAccountConfirmationHandler()
