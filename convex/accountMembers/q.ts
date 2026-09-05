import { v } from 'convex/values'
import { query } from '../_generated/server'
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

/** Invitations awaiting the signed-in caller, matched on their verified email. */
export const listMyInvitations = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(accountMemberDocumentSchema),
  handler: async (ctx, { limit }) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity || identity.emailVerified !== true || !identity.email) {
      return []
    }

    return await ctx.db
      .query('accountMembers')
      .withIndex('by_email_and_status', (q) =>
        q.eq('email', identity.email!.trim().toLowerCase()).eq('status', 'invited')
      )
      .take(normalizeListLimit(limit))
  }
})
