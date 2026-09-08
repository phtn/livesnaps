import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import type { Doc } from '../_generated/dataModel'
import { type QueryCtx, query } from '../_generated/server'
import { workspaceAccess } from '../lib/workspaceAccess'
import { snapHandlerSchema } from '../snaps/d'
import { verificationEntryDocumentSchema } from './d'

const normalizeLimit = (limit?: number) => Math.min(Math.max(Math.floor(Number.isFinite(limit) ? limit! : 100), 1), 250)
const listArgs = { accountId: v.optional(v.id('accounts')), limit: v.optional(v.number()) }
const queueItemSchema = verificationEntryDocumentSchema.extend({ handler: v.optional(snapHandlerSchema) })

async function validEntries(ctx: QueryCtx, entries: Doc<'verificationEntries'>[]) {
  const results = await Promise.all(
    entries.map(async (entry) => {
      const snap = await ctx.db
        .query('snaps')
        .withIndex('by_metadata_upload_id', (q) => q.eq('metadata.upload_id', entry.uploadId))
        .unique()
      if (!snap?.accountId || snap.accountId !== entry.accountId) return null
      return { ...entry, handler: snap.handler }
    })
  )
  return results.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}

/** Every active member can read the Account's verification queue. */
export const listForAdmin = query({
  args: listArgs,
  returns: v.array(verificationEntryDocumentSchema),
  handler: async (ctx, { accountId, limit }) => {
    const { account } = await workspaceAccess(ctx, accountId)
    const entries = await ctx.db
      .query('verificationEntries')
      .withIndex('by_accountId_and_createdAt', (q) => q.eq('accountId', account._id))
      .order('desc')
      .take(normalizeLimit(limit))
    return (await validEntries(ctx, entries)).map(({ handler: _handler, ...entry }) => entry)
  }
})

export const listAllForAdmin = query({
  args: listArgs,
  returns: v.array(queueItemSchema),
  handler: async (ctx, { accountId, limit }) => {
    const { account } = await workspaceAccess(ctx, accountId)
    const entries = await ctx.db
      .query('verificationEntries')
      .withIndex('by_accountId_and_createdAt', (q) => q.eq('accountId', account._id))
      .order('desc')
      .take(normalizeLimit(limit))
    return await validEntries(ctx, entries)
  }
})

export const listForAccountPage = query({
  args: { accountId: v.id('accounts'), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(queueItemSchema),
  handler: async (ctx, { accountId, paginationOpts }) => {
    await workspaceAccess(ctx, accountId)
    const result = await ctx.db
      .query('verificationEntries')
      .withIndex('by_accountId_and_createdAt', (q) => q.eq('accountId', accountId))
      .order('desc')
      .paginate(paginationOpts)
    return { ...result, page: await validEntries(ctx, result.page) }
  }
})
