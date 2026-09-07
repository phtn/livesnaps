import { ConvexError, v } from 'convex/values'
import { internalQuery, query } from '../_generated/server'
import { requireGodIdentity } from '../accounts/helpers'
import { getUserByTokenIdentifier } from '../lib/auth'
import { accountMemberDocumentSchema, accountMemberStatusSchema } from './d'
import { requireAccountAccess } from './helpers'

const DEFAULT_LIST_LIMIT = 100
const MAX_LIST_LIMIT = 250

const normalizeListLimit = (limit: number | undefined) => {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_LIST_LIMIT
  }

  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIST_LIMIT)
}

export const listForAccount = query({
  args: {
    accountId: v.id('accounts'),
    status: v.optional(accountMemberStatusSchema),
    limit: v.optional(v.number())
  },
  returns: v.array(accountMemberDocumentSchema),
  handler: async (ctx, { accountId, status, limit }) => {
    await requireAccountAccess(ctx, accountId, 'viewer')

    const take = normalizeListLimit(limit)

    if (status) {
      return await ctx.db
        .query('accountMembers')
        .withIndex('by_accountId_and_status', (q) => q.eq('accountId', accountId).eq('status', status))
        .take(take)
    }

    return await ctx.db
      .query('accountMembers')
      .withIndex('by_accountId_and_status', (q) => q.eq('accountId', accountId))
      .take(take)
  }
})

/** The caller's own membership for an account, or null if they have none. */
export const getMine = query({
  args: { accountId: v.id('accounts') },
  returns: v.union(accountMemberDocumentSchema, v.null()),
  handler: async (ctx, { accountId }) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      return null
    }

    return await ctx.db
      .query('accountMembers')
      .withIndex('by_accountId_and_tokenIdentifier', (q) =>
        q.eq('accountId', accountId).eq('tokenIdentifier', identity.tokenIdentifier)
      )
      .unique()
  }
})

/**
 * Invitations awaiting the signed-in caller, matched on their verified email.
 *
 * Each row carries its account's name and slug: an invitation the recipient
 * cannot see the name of is one they cannot make a decision about, and the
 * accounts themselves are not readable to someone who is not a member yet.
 */
export const listMyInvitations = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(accountMemberDocumentSchema.extend({ accountName: v.string(), accountSlug: v.string() })),
  handler: async (ctx, { limit }) => {
    const identity = await ctx.auth.getUserIdentity()

    if (identity?.emailVerified !== true || !identity.email) {
      return []
    }

    // Hoisted out of the index callback: TypeScript drops the `!identity.email`
    // narrowing inside a closure, and neither way back is safe on its own — `!`
    // trips `noNonNullAssertion`, and `?.` widens the argument to
    // `string | undefined` and stops compiling.
    const email = identity.email.trim().toLowerCase()

    const invitations = await ctx.db
      .query('accountMembers')
      .withIndex('by_email_and_status', (q) => q.eq('email', email).eq('status', 'invited'))
      .take(normalizeListLimit(limit))

    const named = []

    for (const invitation of invitations) {
      const account = await ctx.db.get(invitation.accountId)

      // An invite whose account has been deleted is not actionable, so it is
      // dropped rather than shown as an unnamed row.
      if (!account || account.status === 'closed' || account.status === 'suspended') continue
      if (invitation.tokenIdentifier && invitation.tokenIdentifier !== identity.tokenIdentifier) continue

      named.push({ ...invitation, accountName: account.name, accountSlug: account.slug })
    }

    return named
  }
})

/**
 * Everything the invitation email needs, read in one place so the action that
 * sends it never touches the database directly.
 *
 * Internal: it answers for any membership without an access check, because its
 * only callers are the scheduled send paths, which run behind the mutation that
 * already authorized the invite.
 */
export const getInviteEmailContextInternal = internalQuery({
  args: { memberId: v.id('accountMembers') },
  returns: v.union(
    v.object({
      accountName: v.string(),
      email: v.string(),
      name: v.union(v.string(), v.null()),
      role: v.string(),
      adminConfirmation: v.boolean()
    }),
    v.null()
  ),
  handler: async (ctx, { memberId }) => {
    const member = await ctx.db.get(memberId)
    if (member?.status !== 'invited') return null

    const account = await ctx.db.get(member.accountId)
    if (!account) return null

    return {
      accountName: account.name,
      email: member.email,
      name: member.name,
      role: member.role,
      adminConfirmation: member.adminConfirmation !== undefined
    }
  }
})

/** Resolves the account contact on the server, never from a submitted Firebase UID. */
export const getContactAdminAccess = query({
  args: { accountId: v.id('accounts') },
  returns: v.object({
    member: v.union(accountMemberDocumentSchema, v.null()),
    firebaseUid: v.union(v.string(), v.null())
  }),
  handler: async (ctx, { accountId }) => {
    await requireGodIdentity(ctx)
    const account = await ctx.db.get(accountId)
    if (!account) throw new ConvexError('Account not found.')
    const member = await ctx.db
      .query('accountMembers')
      .withIndex('by_accountId_and_email', (q) =>
        q.eq('accountId', accountId).eq('email', account.primaryContact.email)
      )
      .unique()
    if (member?.role !== 'owner') return { member: null, firebaseUid: null }
    const user = member.tokenIdentifier ? await getUserByTokenIdentifier(ctx.db, member.tokenIdentifier) : null
    return { member, firebaseUid: user?.firebaseUid ?? null }
  }
})
