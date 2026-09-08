import { ConvexError } from 'convex/values'
import { canUseAccount } from '../../src/lib/accounts/accounts'
import { hasAccountMemberRole, type AccountMemberRole } from '../../src/lib/accounts/members'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { getMembershipByTokenIdentifier } from '../accountMembers/helpers'

type Ctx = QueryCtx | MutationCtx

/** Submission access is always a live Account membership, including for gods. */
export async function requireSubmissionAccountAccess(
  ctx: Ctx,
  accountId: Id<'accounts'>,
  minimumRole: AccountMemberRole = 'viewer'
) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new ConvexError('Unauthorized.')
  const membership = await getMembershipByTokenIdentifier(ctx, accountId, identity.tokenIdentifier)
  const account = await ctx.db.get('accounts', accountId)
  if (!account || !canUseAccount(account.status) || membership?.status !== 'active') {
    throw new ConvexError('Unauthorized.')
  }
  if (!hasAccountMemberRole(membership.role, minimumRole)) {
    throw new ConvexError(minimumRole === 'admin' ? 'Account administrator access is required.' : 'Unauthorized.')
  }
  return {
    identity,
    membership,
    member: membership,
    account,
    canManage: hasAccountMemberRole(membership.role, 'admin')
  }
}

export async function requireSnapAccess(ctx: Ctx, snap: Doc<'snaps'>, minimumRole: AccountMemberRole = 'viewer') {
  if (!snap.accountId) throw new ConvexError('Unauthorized.')
  return await requireSubmissionAccountAccess(ctx, snap.accountId, minimumRole)
}

export const isDraftSnap = (snap: Doc<'snaps'>) =>
  snap.location_session?.status === 'active'

/** A submitter can continue their own open capture, but cannot read submitted contents. */
export async function requireOwnDraftSnap(ctx: Ctx, snap: Doc<'snaps'>) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity || snap.metadata.applicant_token_identifier !== identity.tokenIdentifier || !isDraftSnap(snap)) {
    throw new ConvexError('Unauthorized.')
  }
  if (!snap.accountId) throw new ConvexError('Unauthorized.')
  const account = await ctx.db.get('accounts', snap.accountId)
  if (!account || !canUseAccount(account.status)) throw new ConvexError('This Account is not accepting submissions.')
  return identity
}

export async function requireVerificationEntryAccess(
  ctx: Ctx,
  entry: Doc<'verificationEntries'>,
  minimumRole: AccountMemberRole = 'viewer'
) {
  const snap = await ctx.db.query('snaps')
    .withIndex('by_metadata_upload_id', q => q.eq('metadata.upload_id', entry.uploadId)).unique()
  if (!snap?.accountId || entry.accountId !== snap.accountId) throw new ConvexError('Unauthorized.')
  return { ...await requireSnapAccess(ctx, snap, minimumRole), snap }
}
