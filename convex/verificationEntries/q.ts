import { ConvexError, v } from 'convex/values'
import { type QueryCtx, query } from '../_generated/server'
import { verificationEntryDocumentSchema } from './d'
import { snapHandlerSchema } from '../snaps/d'
import { workspaceAccess } from '../lib/workspaceAccess'

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

  if (identity?.admin !== true) {
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

/** Account administrators see the queue; members see only their own sends. */
export const listAllForAdmin = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(verificationEntryDocumentSchema.extend({ handler: v.optional(snapHandlerSchema) })),
  handler: async (ctx, { limit }) => {
    const { identity, canManage } = await workspaceAccess(ctx)
    const entries = await (canManage
      ? ctx.db.query('verificationEntries').withIndex('by_createdAt')
      : ctx.db.query('verificationEntries').withIndex('by_senderTokenIdentifier_and_createdAt', q => q.eq('senderTokenIdentifier', identity.tokenIdentifier))
    ).order('desc').take(normalizeListLimit(limit))
    return await Promise.all(entries.map(async entry => {
      const snap = await ctx.db.query('snaps').withIndex('by_metadata_upload_id', q => q.eq('metadata.upload_id', entry.uploadId)).unique()
      return { ...entry, handler: snap?.handler }
    }))
  }
})
