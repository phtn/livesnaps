import { ConvexError, v } from 'convex/values'
import { internalMutation, internalQuery } from '../_generated/server'
import { snapDocumentSchema } from '../snaps/d'
import { verificationEntryDocumentSchema } from './d'

export const getEntryInternal = internalQuery({
  args: { id: v.id('verificationEntries') },
  returns: v.union(verificationEntryDocumentSchema, v.null()),
  handler: async (ctx, { id }) => {
    return await ctx.db.get('verificationEntries', id)
  }
})

export const getSnapByUploadIdInternal = internalQuery({
  args: { uploadId: v.string() },
  returns: v.union(snapDocumentSchema, v.null()),
  handler: async (ctx, { uploadId }) => {
    try {
      const proof = await ctx.db
        .query('snaps')
        .withIndex('by_metadata_upload_id', (q) => q.eq('metadata.upload_id', uploadId))
        .unique()
      return proof
    } catch {
      return null
    }
  }
})

export const markSubmittedInternal = internalMutation({
  args: {
    id: v.id('verificationEntries'),
    attachments: v.array(v.string())
  },
  returns: verificationEntryDocumentSchema,
  handler: async (ctx, { id, attachments }) => {
    await ctx.db.patch(id, {
      attachments,
      status: 'submitted' as const,
      updatedAt: Date.now()
    })
    const updated = await ctx.db.get('verificationEntries', id)
    if (!updated) throw new ConvexError('Unable to read entry after send.')
    return updated
  }
})

export const markFailedInternal = internalMutation({
  args: { id: v.id('verificationEntries') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    try {
      await ctx.db.patch(id, {
        status: 'failed' as const,
        updatedAt: Date.now()
      })
    } catch {}
    return null
  }
})

export const setSnapVerificationStatusInternal = internalMutation({
  args: {
    uploadId: v.string(),
    verification_status: v.union(v.literal('draft'), v.literal('submitted'))
  },
  returns: v.union(snapDocumentSchema, v.null()),
  handler: async (ctx, { uploadId, verification_status }) => {
    const snap = await ctx.db
      .query('snaps')
      .withIndex('by_metadata_upload_id', (q) => q.eq('metadata.upload_id', uploadId))
      .unique()
      .catch((): null => null)
    if (!snap) {
      return null
    }
    await ctx.db.patch(snap._id, {
      verification_status,
      updated_at: Date.now()
    })
    const updated = await ctx.db.get('snaps', snap._id)
    return updated
  }
})

export const setSnapHandlerAndStatusInternal = internalMutation({
  args: {
    uploadId: v.string(),
    handler: v.object({ email: v.string(), name: v.string() }),
    verification_status: v.union(v.literal('draft'), v.literal('submitted'))
  },
  returns: v.union(snapDocumentSchema, v.null()),
  handler: async (ctx, { uploadId, handler, verification_status }) => {
    const snap = await ctx.db
      .query('snaps')
      .withIndex('by_metadata_upload_id', (q) => q.eq('metadata.upload_id', uploadId))
      .unique()
      .catch((): null => null)
    if (!snap) {
      return null
    }
    if (snap.handler || snap.verification_status) {
      throw new ConvexError('snap already used for verification.')
    }
    await ctx.db.patch(snap._id, {
      handler,
      verification_status,
      updated_at: Date.now()
    })
    const updated = await ctx.db.get('snaps', snap._id)
    return updated
  }
})
