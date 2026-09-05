import { ConvexError, v } from 'convex/values'
import { type QueryCtx, query } from '../_generated/server'
import { verificationEntryDocumentSchema } from './d'

const DEFAULT_LIST_LIMIT = 100
const MAX_LIST_LIMIT = 250

const normalizeListLimit = (limit: number | undefined) => {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_LIST_LIMIT
  }

  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIST_LIMIT)
}

const requireAdminIdentity = async (ctx: QueryCtx) => {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity || identity.admin !== true) {
    throw new ConvexError('Unauthorized.')
  }

  return identity
}

/** The entries the calling administrator sent, newest first. */
export const listForAdmin = query({
  args: {
    limit: v.optional(v.number())
  },
  returns: v.array(verificationEntryDocumentSchema),
  handler: async (ctx, { limit }) => {
    const identity = await requireAdminIdentity(ctx)

    const senderTokenIdentifier = identity.tokenIdentifier.trim()
    if (!senderTokenIdentifier) {
      return []
    }

    return await ctx.db
      .query('verificationEntries')
      .withIndex('by_senderTokenIdentifier_and_createdAt', (q) => q.eq('senderTokenIdentifier', senderTokenIdentifier))
      .order('desc')
      .take(normalizeListLimit(limit))
  }
})

/**
 * Every entry, newest first, regardless of who sent it — the workspace table
 * reviews the whole queue rather than one administrator's own sends. Mirrors
 * `snaps.q.listForAdmin`, which is admin-wide for the same reason.
 */
export const listAllForAdmin = query({
  args: {
    limit: v.optional(v.number())
  },
  returns: v.array(verificationEntryDocumentSchema),
  handler: async (ctx, { limit }) => {
    await requireAdminIdentity(ctx)

    return await ctx.db
      .query('verificationEntries')
      .withIndex('by_createdAt')
      .order('desc')
      .take(normalizeListLimit(limit))
  }
})
