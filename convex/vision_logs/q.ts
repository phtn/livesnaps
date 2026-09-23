import { requireGodIdentity } from '../accounts/helpers'
import { ConvexError, v } from 'convex/values'
import { internalQuery, query } from '../_generated/server'
import { visionLogDocumentSchema } from './d'

export const listByUploadId = internalQuery({
  args: { upload_id: v.string() },
  returns: v.array(visionLogDocumentSchema),
  handler: async (ctx, { upload_id }) => {
    return await ctx.db
      .query('vision_logs')
      .withIndex('by_upload_id', (q) => q.eq('upload_id', upload_id))
      .order('desc')
      .take(250)
  }
})

export const listAll = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(visionLogDocumentSchema),
  handler: async (ctx, { limit }) => {
    const identity = await ctx.auth.getUserIdentity()

    if (identity?.admin !== true) {
      throw new ConvexError('Unauthorized.')
    }

    const baseQuery = ctx.db.query('vision_logs').withIndex('by_createdAt').order('desc')

    if (limit !== undefined) {
      const take = Math.min(Math.max(Math.floor(limit), 1), 1000)
      return await baseQuery.take(take)
    }

    return await baseQuery.take(250)
  }
})

export const listRecent = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(visionLogDocumentSchema),
  handler: async (ctx, { limit }) => {
    const take = Math.min(Math.max(Math.floor(limit ?? 50), 1), 100)
    return await ctx.db.query('vision_logs').withIndex('by_createdAt').order('desc').take(take)
  }
})

/** Cross-account diagnostics are restricted to Citadel operators. */
export const listForGod = query({
  args: {},
  returns: v.array(visionLogDocumentSchema),
  handler: async (ctx) => {
    await requireGodIdentity(ctx)
    return await ctx.db.query('vision_logs').withIndex('by_createdAt').order('desc').take(250)
  }
})
