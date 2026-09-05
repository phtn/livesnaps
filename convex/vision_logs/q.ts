import { ConvexError, v } from 'convex/values'
import { query } from '../_generated/server'
import { visionLogDocumentSchema } from './d'

export const listByUploadId = query({
  args: { upload_id: v.string() },
  returns: v.array(visionLogDocumentSchema),
  handler: async (ctx, { upload_id }) => {
    return await ctx.db
      .query('vision_logs')
      .withIndex('by_upload_id', (q) => q.eq('upload_id', upload_id))
      .order('desc')
      .collect()
  }
})

export const listAll = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(visionLogDocumentSchema),
  handler: async (ctx, { limit }) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity || identity.admin !== true) {
      throw new ConvexError('Unauthorized.')
    }

    const baseQuery = ctx.db.query('vision_logs').withIndex('by_createdAt').order('desc')

    if (limit !== undefined) {
      const take = Math.min(Math.max(Math.floor(limit), 1), 1000)
      return await baseQuery.take(take)
    }

    return await baseQuery.collect()
  }
})

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(visionLogDocumentSchema),
  handler: async (ctx, { limit }) => {
    const take = Math.min(limit ?? 50, 100)
    return await ctx.db.query('vision_logs').withIndex('by_createdAt').order('desc').take(take)
  }
})
