import { ConvexError, v } from 'convex/values'
import { query } from '../_generated/server'
import { verificationEntryDocumentSchema } from './d'

const DEFAULT_LIST_LIMIT = 100
const MAX_LIST_LIMIT = 250

const normalizeListLimit = (limit: number | undefined) => {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_LIST_LIMIT
  }

  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIST_LIMIT)
}

export const listForAdmin = query({
  args: {
    limit: v.optional(v.number())
  },
  returns: v.array(verificationEntryDocumentSchema),
  handler: async (ctx, { limit }) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity || identity.admin !== true) {
      throw new ConvexError('Unauthorized.')
    }

    const senderTokenIdentifier = identity.tokenIdentifier.trim()
    if (!senderTokenIdentifier) {
      return []
    }

    return await ctx.db
      .query('verificationEntries')
      .withIndex('by_senderTokenIdentifier_and_createdAt', (q) =>
        q.eq('senderTokenIdentifier', senderTokenIdentifier)
      )
      .order('desc')
      .take(normalizeListLimit(limit))
  }
})
