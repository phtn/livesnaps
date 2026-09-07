import type { UserRecord } from 'firebase-admin/auth'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { api } from '../../convex/_generated/api'
import { getFirebaseUserByEmail, getFirebaseUserByUid } from '@/lib/firebase-admin/admin'
import { revokeAccountAdminClaim } from '@/lib/firebase-admin/account-admin-access'
import { canViewTopgFirebaseUser, type FirebaseCustomClaims } from '@/lib/firebase-admin/custom-claims'
import { readFirebaseCustomClaims } from '@/lib/firebase-admin/god-directory'
import { type createConvexClient, RequestError } from './convex'

export type ContactAdminAction = 'cancel-admin-invite' | 'revoke-admin'
export type ContactAdminAccess = {
  memberId: Id<'accountMembers'> | null
  status: 'pending' | 'confirming' | 'granted' | 'cancelled' | 'revoking' | 'revoked' | 'not-granted' | 'unavailable'
  claimGranted: boolean | null
  canCancel: boolean
  canRevoke: boolean
  error: string | null
}
type Actor = { uid: string; claims: FirebaseCustomClaims }
type Client = Pick<ReturnType<typeof createConvexClient>, 'query' | 'mutation'>
const dependencies = {
  getByUid: getFirebaseUserByUid,
  getByEmail: getFirebaseUserByEmail,
  revoke: revokeAccountAdminClaim
}

export function createContactAdminAccessService(deps = dependencies) {
  async function load(client: Client, account: Doc<'accounts'>, actor: Actor) {
    if (actor.claims.god !== true) throw new RequestError(403, 'God access is required.')
    const context = await client.query(api.accountMembers.q.getContactAdminAccess, { accountId: account._id })
    let target: UserRecord | null = null
    let error: string | null = null
    try {
      if (context.member)
        target = context.firebaseUid
          ? await deps.getByUid(context.firebaseUid)
          : await deps.getByEmail(account.primaryContact.email)
    } catch (failure) {
      if (
        !(
          typeof failure === 'object' &&
          failure !== null &&
          'code' in failure &&
          failure.code === 'auth/user-not-found'
        )
      ) {
        error = 'Could not read the contact’s admin claim. Reload to try again.'
      }
    }
    const claims = readFirebaseCustomClaims(target?.customClaims)
    const mayRevoke = target !== null && target.uid !== actor.uid && canViewTopgFirebaseUser(actor.claims, claims)
    const member = context.member
    const stage = member?.adminConfirmation
    const canCancel = member?.status === 'invited' && (!stage || stage === 'pending')
    const claimGranted = error ? null : claims.admin === true
    const status: ContactAdminAccess['status'] =
      stage === 'cancelled'
        ? 'cancelled'
        : stage === 'revoking'
          ? 'revoking'
          : stage === 'revoked' && !claimGranted
            ? 'revoked'
            : canCancel
              ? 'pending'
              : stage === 'confirmed'
                ? 'confirming'
                : error
                  ? 'unavailable'
                  : claimGranted
                    ? 'granted'
                    : stage === 'complete'
                      ? 'revoked'
                      : 'not-granted'
    return {
      target,
      member,
      summary: {
        memberId: member?._id ?? null,
        status,
        claimGranted,
        canCancel,
        canRevoke: !!member && mayRevoke && (claimGranted === true || stage === 'confirmed' || stage === 'revoking'),
        error
      } satisfies ContactAdminAccess
    }
  }

  return {
    async read(client: Client, account: Doc<'accounts'>, actor: Actor): Promise<ContactAdminAccess> {
      return (await load(client, account, actor)).summary
    },
    async change(client: Client, account: Doc<'accounts'>, actor: Actor, action: ContactAdminAction, memberId: string) {
      const { target, member, summary } = await load(client, account, actor)
      if (!member || member._id !== memberId)
        throw new RequestError(409, 'The account contact has changed. Reload before continuing.')
      const args = { accountId: account._id, memberId: member._id }
      if (action === 'cancel-admin-invite') {
        if (!summary.canCancel)
          throw new RequestError(409, 'Confirmation has already started or was cancelled. Reload this account.')
        await client.mutation(api.accountMembers.m.cancelAdminInvitation, args)
      } else {
        if (!summary.canRevoke || !target)
          throw new RequestError(403, summary.error ?? 'This contact’s admin access cannot be revoked by your account.')
        await client.mutation(api.accountMembers.m.beginAdminRevocation, args)
        // Keep the revoking state on failure so the operator can retry safely.
        try {
          await deps.revoke(target.uid)
        } catch {
          throw new RequestError(502, 'Admin revocation is incomplete. Reload the account and retry revocation.')
        }
        await client.mutation(api.accountMembers.m.completeAdminRevocation, args)
      }
    }
  }
}

export const contactAdminAccessService = createContactAdminAccessService()
