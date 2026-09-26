import { ConvexError } from 'convex/values'
import {
  ACCOUNT_MEMBER_NAME_MAX_LENGTH,
  ACCOUNT_MEMBER_ROLE_VALUES,
  ACCOUNT_MEMBER_TITLE_MAX_LENGTH,
  type AccountMemberRole,
  hasAccountMemberRole
} from '../../src/lib/accounts/members'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
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
 * it is always read from `accountMembers`. Gods can manage Account provisioning without membership; account admins
 * must hold the required role — and are reported as `{ membership: null }` so
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

  if (identity.god === true) {
    return { tokenIdentifier: identity.tokenIdentifier, isPlatformAdmin: true, membership: null }
  }

  const membership = await getMembershipByTokenIdentifier(ctx, accountId, identity.tokenIdentifier)

  if (membership?.status !== 'active') {
    throw new ConvexError('Unauthorized.')
  }

  if (!hasAccountMemberRole(membership.role, minimumRole)) {
    throw new ConvexError('Unauthorized.')
  }

  return { tokenIdentifier: identity.tokenIdentifier, isPlatformAdmin: false, membership }
}

/**
 * What `actor` may change on `member`. Owners (and gods) manage everyone; an
 * admin manages members, viewers, and themselves, never another admin or an
 * owner. Only an owner can hand out the owner role. The role, status, and title
 * mutations enforce this, and the detail query reports it so the page offers
 * only what will succeed.
 */
export const getMemberManagement = (
  actor: Awaited<ReturnType<typeof requireAccountAccess>>,
  member: Doc<'accountMembers'>
) => {
  const actorRole = actor.membership?.role
  const isSelf = actor.membership?._id === member._id
  const isOwnerActor = actor.isPlatformAdmin || actorRole === 'owner'
  const canManage =
    isOwnerActor || (actorRole === 'admin' && (isSelf || member.role === 'member' || member.role === 'viewer'))
  const assignableRoles: AccountMemberRole[] = canManage
    ? ACCOUNT_MEMBER_ROLE_VALUES.filter((role) => role !== 'owner' || isOwnerActor)
    : []

  return { canManage, isSelf, assignableRoles }
}

export const requireMemberManagement = (
  actor: Awaited<ReturnType<typeof requireAccountAccess>>,
  member: Doc<'accountMembers'>
) => {
  const management = getMemberManagement(actor, member)

  if (!management.canManage) {
    throw new ConvexError('Only an account owner can change an admin or another owner.')
  }

  return management
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
