import { ConvexError, v } from 'convex/values'
import { DEFAULT_ACCOUNT_MEMBER_ROLE } from '../../src/lib/accounts/members'
import { renderAccountInviteEmail } from '../../src/lib/email/account-invite'
import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { internalAction, type MutationCtx, mutation } from '../_generated/server'
import { getAppBaseUrl, sendTransactionalEmail } from '../lib/email'
import { normalizeAccountEmail, requireGodIdentity } from '../accounts/helpers'
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

    const memberId = await ctx.db.insert('accountMembers', {
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

    // Scheduled rather than awaited: a mutation cannot make a network call, and
    // a bounced send must not roll back a membership that was created correctly.
    await ctx.scheduler.runAfter(0, internal.accountMembers.m.sendInviteEmail, { memberId })

    return memberId
  }
})

/**
 * Emails a pending member their invitation.
 *
 * Internal and scheduled from the mutations that create an invited membership,
 * so the authorization for the invite has already happened by the time this
 * runs. It reads its own copy of the row instead of trusting arguments, and a
 * failure here leaves the membership in place to be re-sent.
 */
export const sendInviteEmail = internalAction({
  args: { memberId: v.id('accountMembers'), inviterName: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, { memberId, inviterName }) => {
    const context = await ctx.runQuery(internal.accountMembers.q.getInviteEmailContextInternal, { memberId })

    if (!context) {
      console.warn('[accountMembers sendInviteEmail] membership or account is gone', { memberId })
      return null
    }

    const email = renderAccountInviteEmail({
      accountName: context.accountName,
      inviteeName: context.name,
      inviteeEmail: context.email,
      role: context.role,
      inviterName: inviterName ?? null,
      acceptUrl: `${getAppBaseUrl()}/account#invitations`,
      adminConfirmation: context.adminConfirmation
    })

    await sendTransactionalEmail({
      to: context.email,
      subject: email.subject,
      html: email.html,
      text: email.text
    })

    return null
  }
})

/** A provisioning confirmation is bound to the verified contact, never a supplied UID. */
async function requireAdminConfirmation(ctx: MutationCtx, accountId: Id<'accounts'>) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity?.email || identity.emailVerified !== true) {
    throw new ConvexError('Sign in with your verified contact email to confirm admin access.')
  }
  const account = await requireAccount(ctx, accountId)
  const email = identity.email.trim().toLowerCase()
  const member = await getMembershipByEmail(ctx, accountId, email)
  if (
    !member?.adminConfirmation ||
    !['pending', 'confirmed', 'complete'].includes(member.adminConfirmation) ||
    member.role !== 'owner' ||
    member.status === 'suspended' ||
    account.status === 'closed' ||
    account.status === 'suspended' ||
    account.primaryContact.email !== email ||
    (member.tokenIdentifier !== null && member.tokenIdentifier !== identity.tokenIdentifier)
  ) {
    throw new ConvexError('No admin confirmation is available for this contact.')
  }
  return { identity, member, account }
}

export const confirmAdminAccess = mutation({
  args: { accountId: v.id('accounts') },
  returns: accountMemberDocumentSchema,
  handler: async (ctx, { accountId }) => {
    const { identity, member } = await requireAdminConfirmation(ctx, accountId)
    if (member.adminConfirmation === 'complete') return member
    const user = await getUserByTokenIdentifier(ctx.db, identity.tokenIdentifier)
    await ctx.db.patch(member._id, {
      adminConfirmation: 'confirmed',
      tokenIdentifier: identity.tokenIdentifier,
      userId: user?._id ?? null,
      updatedAt: Date.now(),
      updatedBy: identity.tokenIdentifier
    })
    const confirmed = await ctx.db.get(member._id)
    if (!confirmed) throw new ConvexError('Membership not found.')
    return confirmed
  }
})

/** Activate only after Firebase has issued a token proving the claim was granted. */
export const completeAdminConfirmation = mutation({
  args: { accountId: v.id('accounts') },
  returns: v.null(),
  handler: async (ctx, { accountId }) => {
    const { identity, member, account } = await requireAdminConfirmation(ctx, accountId)
    if (identity.admin !== true || member.adminConfirmation === 'pending') {
      throw new ConvexError('Confirm admin access and refresh your session before continuing.')
    }
    if (member.adminConfirmation === 'complete') return null
    const now = Date.now()
    await ctx.db.patch(member._id, {
      adminConfirmation: 'complete',
      status: 'active',
      joinedAt: now,
      updatedAt: now,
      updatedBy: identity.tokenIdentifier
    })
    await ctx.db.patch(accountId, {
      status: 'confirmed',
      primaryContact: { ...account.primaryContact, tokenIdentifier: identity.tokenIdentifier },
      ownerTokenIdentifier: identity.tokenIdentifier,
      updatedAt: now,
      updatedBy: identity.tokenIdentifier
    })
    return null
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

    if (invite?.adminConfirmation) {
      throw new ConvexError('Confirm admin access from your Account page.')
    }

    if (invite?.status !== 'invited') {
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

async function requireContactMember(ctx: MutationCtx, accountId: Id<'accounts'>, memberId: Id<'accountMembers'>) {
  const identity = await requireGodIdentity(ctx)
  const account = await requireAccount(ctx, accountId)
  const member = await ctx.db.get(memberId)
  if (
    !member ||
    member.accountId !== accountId ||
    member.email !== account.primaryContact.email ||
    member.role !== 'owner'
  ) {
    throw new ConvexError('The account contact has changed. Reload the account before continuing.')
  }
  return { identity, account, member }
}

export const cancelAdminInvitation = mutation({
  args: { accountId: v.id('accounts'), memberId: v.id('accountMembers') },
  returns: v.null(),
  handler: async (ctx, { accountId, memberId }) => {
    const { identity, member } = await requireContactMember(ctx, accountId, memberId)
    if (member.adminConfirmation === 'cancelled') return null
    if (member.status !== 'invited' || (member.adminConfirmation && member.adminConfirmation !== 'pending')) {
      throw new ConvexError('Confirmation has already started. Reload the account and revoke admin access instead.')
    }
    const now = Date.now()
    await ctx.db.patch(memberId, {
      adminConfirmation: 'cancelled',
      status: 'suspended',
      updatedAt: now,
      updatedBy: identity.tokenIdentifier
    })
    await ctx.db.patch(accountId, { updatedAt: now, updatedBy: identity.tokenIdentifier })
    return null
  }
})

/** Block confirmation first; Firebase removal may be retried after a network failure. */
export const beginAdminRevocation = mutation({
  args: { accountId: v.id('accounts'), memberId: v.id('accountMembers') },
  returns: v.null(),
  handler: async (ctx, { accountId, memberId }) => {
    const { identity, member, account } = await requireContactMember(ctx, accountId, memberId)
    if (member.tokenIdentifier === identity.tokenIdentifier) throw new ConvexError('You cannot revoke your own access.')
    const now = Date.now()
    await ctx.db.patch(memberId, {
      adminConfirmation: 'revoking',
      status: 'suspended',
      updatedAt: now,
      updatedBy: identity.tokenIdentifier
    })
    await ctx.db.patch(accountId, {
      status: account.status === 'closed' ? 'closed' : 'suspended',
      updatedAt: now,
      updatedBy: identity.tokenIdentifier
    })
    return null
  }
})

export const completeAdminRevocation = mutation({
  args: { accountId: v.id('accounts'), memberId: v.id('accountMembers') },
  returns: v.null(),
  handler: async (ctx, { accountId, memberId }) => {
    const { identity, member } = await requireContactMember(ctx, accountId, memberId)
    if (member.adminConfirmation === 'revoked') return null
    if (member.adminConfirmation !== 'revoking') throw new ConvexError('No admin revocation is in progress.')
    await ctx.db.patch(memberId, {
      adminConfirmation: 'revoked',
      updatedAt: Date.now(),
      updatedBy: identity.tokenIdentifier
    })
    return null
  }
})
