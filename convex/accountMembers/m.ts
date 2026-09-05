import { ConvexError, v } from 'convex/values'
import { DEFAULT_ACCOUNT_MEMBER_ROLE } from '../../src/lib/accounts/members'
import type { Id } from '../_generated/dataModel'
import { type MutationCtx, mutation } from '../_generated/server'
import { normalizeAccountEmail } from '../accounts/helpers'
import { getUserByTokenIdentifier } from '../lib/auth'
import { accountMemberDocumentSchema, accountMemberRoleSchema, inviteAccountMemberSchema } from './d'
import {
  countOwners,
  getMembershipByEmail,
  getMembershipByTokenIdentifier,
  normalizeMemberName,
  normalizeMemberTitle,
  requireAccountAccess
} from './helpers'

const requireAccount = async (ctx: MutationCtx, accountId: Id<'accounts'>) => {
  const account = await ctx.db.get(accountId)

  if (!account) {
    throw new ConvexError('Account not found.')
  }

  return account
}

/** Only an owner may create or unmake another owner. */
const requireOwnerForOwnerChange = (role: string, actor: Awaited<ReturnType<typeof requireAccountAccess>>) => {
  if (role !== 'owner') return

  if (!actor.isPlatformAdmin && actor.membership?.role !== 'owner') {
    throw new ConvexError('Only an account owner can grant the owner role.')
  }
}

export const invite = mutation({
  args: inviteAccountMemberSchema,
  returns: v.id('accountMembers'),
  handler: async (ctx, args) => {
    const actor = await requireAccountAccess(ctx, args.accountId, 'admin')
    await requireAccount(ctx, args.accountId)

    const role = args.role ?? DEFAULT_ACCOUNT_MEMBER_ROLE
    requireOwnerForOwnerChange(role, actor)

    const email = normalizeAccountEmail(args.email, 'Member email')

    if (await getMembershipByEmail(ctx, args.accountId, email)) {
      throw new ConvexError(`${email} is already a member of this account.`)
    }

    const now = Date.now()

    return await ctx.db.insert('accountMembers', {
      accountId: args.accountId,
      email,
      tokenIdentifier: null,
      userId: null,
      name: normalizeMemberName(args.name),
      title: normalizeMemberTitle(args.title),
      role,
      status: 'invited',
      invitedAt: now,
      invitedBy: actor.tokenIdentifier,
      joinedAt: null,
      updatedAt: now,
      updatedBy: actor.tokenIdentifier
    })
  }
})

/**
 * Claims a pending invite for the signed-in caller. The invite is matched on the
 * verified email of the identity, never on an argument, so a caller cannot
 * accept someone else's invitation.
 */
export const acceptInvite = mutation({
  args: { accountId: v.id('accounts') },
  returns: accountMemberDocumentSchema,
  handler: async (ctx, { accountId }) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      throw new ConvexError('Unauthenticated.')
    }

    if (identity.emailVerified !== true || !identity.email) {
      throw new ConvexError('Verify your email address before accepting an invitation.')
    }

    const email = identity.email.trim().toLowerCase()

    const existing = await getMembershipByTokenIdentifier(ctx, accountId, identity.tokenIdentifier)

    if (existing) {
      throw new ConvexError('You are already a member of this account.')
    }

    const invite = await getMembershipByEmail(ctx, accountId, email)

    if (!invite || invite.status !== 'invited') {
      throw new ConvexError('No pending invitation for this account.')
    }

    const user = await getUserByTokenIdentifier(ctx.db, identity.tokenIdentifier)
    const now = Date.now()

    await ctx.db.patch(invite._id, {
      tokenIdentifier: identity.tokenIdentifier,
      userId: user?._id ?? null,
      name: invite.name ?? normalizeMemberName(identity.name),
      status: 'active',
      joinedAt: now,
      updatedAt: now,
      updatedBy: identity.tokenIdentifier
    })

    const accepted = await ctx.db.get(invite._id)

    if (!accepted) {
      throw new ConvexError('Membership not found.')
    }

    return accepted
  }
})

export const setRole = mutation({
  args: { memberId: v.id('accountMembers'), role: accountMemberRoleSchema },
  returns: accountMemberDocumentSchema,
  handler: async (ctx, { memberId, role }) => {
    const member = await ctx.db.get(memberId)

    if (!member) {
      throw new ConvexError('Membership not found.')
    }

    const actor = await requireAccountAccess(ctx, member.accountId, 'admin')
    requireOwnerForOwnerChange(role, actor)

    if (member.role === 'owner' && role !== 'owner' && (await countOwners(ctx, member.accountId)) < 2) {
      throw new ConvexError('An account must keep at least one owner.')
    }

    // An admin may manage members and viewers, but not their peers.
    if (member.role === 'admin' && actor.membership?.role === 'admin') {
      throw new ConvexError('Only an account owner can change another admin’s role.')
    }

    await ctx.db.patch(memberId, {
      role,
      updatedAt: Date.now(),
      updatedBy: actor.tokenIdentifier
    })

    const updated = await ctx.db.get(memberId)

    if (!updated) {
      throw new ConvexError('Membership not found.')
    }

    return updated
  }
})

export const setStatus = mutation({
  args: { memberId: v.id('accountMembers'), status: v.union(v.literal('active'), v.literal('suspended')) },
  returns: accountMemberDocumentSchema,
  handler: async (ctx, { memberId, status }) => {
    const member = await ctx.db.get(memberId)

    if (!member) {
      throw new ConvexError('Membership not found.')
    }

    const actor = await requireAccountAccess(ctx, member.accountId, 'admin')

    if (member.status === 'invited') {
      throw new ConvexError('An invitation must be accepted before it can be suspended or reactivated.')
    }

    if (status === 'suspended' && member.role === 'owner' && (await countOwners(ctx, member.accountId)) < 2) {
      throw new ConvexError('An account must keep at least one owner.')
    }

    await ctx.db.patch(memberId, {
      status,
      updatedAt: Date.now(),
      updatedBy: actor.tokenIdentifier
    })

    const updated = await ctx.db.get(memberId)

    if (!updated) {
      throw new ConvexError('Membership not found.')
    }

    return updated
  }
})

/** Removes a member, or revokes an invitation that has not been accepted. */
export const remove = mutation({
  args: { memberId: v.id('accountMembers') },
  returns: v.null(),
  handler: async (ctx, { memberId }) => {
    const member = await ctx.db.get(memberId)

    if (!member) {
      throw new ConvexError('Membership not found.')
    }

    const actor = await requireAccountAccess(ctx, member.accountId, 'admin')

    if (member.role === 'owner' && (await countOwners(ctx, member.accountId)) < 2) {
      throw new ConvexError('An account must keep at least one owner.')
    }

    if (member.role === 'owner' && !actor.isPlatformAdmin && actor.membership?.role !== 'owner') {
      throw new ConvexError('Only an account owner can remove another owner.')
    }

    if (member.role === 'admin' && actor.membership?.role === 'admin' && member._id !== actor.membership._id) {
      throw new ConvexError('Only an account owner can remove another admin.')
    }

    await ctx.db.delete(memberId)

    return null
  }
})
