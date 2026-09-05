import { ConvexError } from 'convex/values'
import {
  ACCOUNT_MEMBER_NAME_MAX_LENGTH,
  ACCOUNT_MEMBER_TITLE_MAX_LENGTH,
  type AccountMemberRole,
  hasAccountMemberRole
} from '../../src/lib/accounts/members'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { isPlatformStaff } from '../lib/auth'
import { trimOrNull } from '../utils'

type Ctx = QueryCtx | MutationCtx

export const getMembershipByTokenIdentifier = async (ctx: Ctx, accountId: Id<'accounts'>, tokenIdentifier: string) =>
  await ctx.db
    .query('accountMembers')
    .withIndex('by_accountId_and_tokenIdentifier', (q) =>
      q.eq('accountId', accountId).eq('tokenIdentifier', tokenIdentifier)
    )
    .unique()

export const getMembershipByEmail = async (ctx: Ctx, accountId: Id<'accounts'>, email: string) =>
  await ctx.db
    .query('accountMembers')
    .withIndex('by_accountId_and_email', (q) => q.eq('accountId', accountId).eq('email', email))
    .unique()

export const countOwners = async (ctx: Ctx, accountId: Id<'accounts'>) => {
  const owners = await ctx.db
    .query('accountMembers')
    .withIndex('by_accountId_and_role', (q) => q.eq('accountId', accountId).eq('role', 'owner'))
    .take(2)

  return owners.length
}

/**
 * Access to an account is a membership, not a claim on the identity token, so
 * it is always read from `accountMembers`. Platform admins bypass membership —
 * they operate every account — and are reported as `{ membership: null }` so
 * callers can tell a staff action apart from a customer's own.
 */
export const requireAccountAccess = async (
  ctx: Ctx,
  accountId: Id<'accounts'>,
  minimumRole: AccountMemberRole
): Promise<{ tokenIdentifier: string; isPlatformAdmin: boolean; membership: Doc<'accountMembers'> | null }> => {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity) {
    throw new ConvexError('Unauthenticated.')
  }

  if (isPlatformStaff(identity)) {
    return { tokenIdentifier: identity.tokenIdentifier, isPlatformAdmin: true, membership: null }
  }

  const membership = await getMembershipByTokenIdentifier(ctx, accountId, identity.tokenIdentifier)

  if (!membership || membership.status !== 'active') {
    throw new ConvexError('Unauthorized.')
  }

  if (!hasAccountMemberRole(membership.role, minimumRole)) {
    throw new ConvexError('Unauthorized.')
  }

  return { tokenIdentifier: identity.tokenIdentifier, isPlatformAdmin: false, membership }
}

export const normalizeMemberName = (name: string | null | undefined) => {
  const trimmed = trimOrNull(name)

  if (trimmed && trimmed.length > ACCOUNT_MEMBER_NAME_MAX_LENGTH) {
    throw new ConvexError(`Member name must be ${ACCOUNT_MEMBER_NAME_MAX_LENGTH} characters or fewer.`)
  }

  return trimmed
}

export const normalizeMemberTitle = (title: string | null | undefined) => {
  const trimmed = trimOrNull(title)

  if (trimmed && trimmed.length > ACCOUNT_MEMBER_TITLE_MAX_LENGTH) {
    throw new ConvexError(`Member title must be ${ACCOUNT_MEMBER_TITLE_MAX_LENGTH} characters or fewer.`)
  }

  return trimmed
}
