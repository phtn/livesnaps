import { ConvexError, v } from 'convex/values'
import { canUseAccount } from '../../src/lib/accounts/accounts'
import { hasAccountMemberRole } from '../../src/lib/accounts/members'
import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import { httpAction, internalMutation, type MutationCtx } from '../_generated/server'
import { getMembershipByTokenIdentifier } from '../accountMembers/helpers'

export const ATTACHMENT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024
export const ATTACHMENT_UPLOAD_TTL_MS = 10 * 60 * 1000

/** The bearer capability was issued to this member; revocation takes effect before storage and attachment. */
async function requireIntentAccess(ctx: MutationCtx, intent: Doc<'verificationUploadIntents'>) {
  if (intent.expiresAt <= Date.now()) throw new ConvexError('Upload expired.')
  const member = await getMembershipByTokenIdentifier(ctx, intent.accountId, intent.tokenIdentifier)
  const account = await ctx.db.get('accounts', intent.accountId)
  const entry = await ctx.db.get('verificationEntries', intent.entryId)
  if (
    member?.status !== 'active' ||
    !hasAccountMemberRole(member.role, 'member') ||
    !account ||
    !canUseAccount(account.status)
  ) {
    throw new ConvexError('Unauthorized.')
  }
  if (!entry || entry.accountId !== intent.accountId || entry.status === 'submitted')
    throw new ConvexError('Unauthorized.')
  const snap = await ctx.db
    .query('snaps')
    .withIndex('by_metadata_upload_id', (q) => q.eq('metadata.upload_id', entry.uploadId))
    .unique()
  if (snap?.accountId !== intent.accountId) throw new ConvexError('Unauthorized.')
}

export const claim = internalMutation({
  args: { token: v.string() },
  returns: v.id('verificationUploadIntents'),
  handler: async (ctx, { token }) => {
    const intent = await ctx.db
      .query('verificationUploadIntents')
      .withIndex('by_token', (q) => q.eq('token', token))
      .unique()
    if (intent?.state !== 'pending') throw new ConvexError('Upload URL is invalid or already used.')
    await requireIntentAccess(ctx, intent)
    await ctx.db.patch(intent._id, { state: 'uploading' })
    return intent._id
  }
})

export const complete = internalMutation({
  args: { intentId: v.id('verificationUploadIntents'), storageId: v.id('_storage'), contentType: v.string() },
  returns: v.null(),
  handler: async (ctx, { intentId, storageId, contentType }) => {
    const intent = await ctx.db.get('verificationUploadIntents', intentId)
    if (intent?.state !== 'uploading') throw new ConvexError('Upload is no longer available.')
    await requireIntentAccess(ctx, intent)
    const file = await ctx.db.system.get('_storage', storageId)
    if (!file || file.size <= 0 || file.size > ATTACHMENT_UPLOAD_MAX_BYTES)
      throw new ConvexError('Invalid attachment size.')
    await ctx.db.patch(intentId, {
      state: 'uploaded',
      storageId,
      size: file.size,
      contentType: file.contentType ?? contentType
    })
    return null
  }
})

export const cleanup = internalMutation({
  args: { intentId: v.id('verificationUploadIntents') },
  returns: v.null(),
  handler: async (ctx, { intentId }) => {
    const intent = await ctx.db.get('verificationUploadIntents', intentId)
    if (!intent || intent.state === 'attached' || intent.expiresAt > Date.now()) return null
    if (intent.storageId) await ctx.storage.delete(intent.storageId)
    await ctx.db.delete(intentId)
    return null
  }
})

/** Preserve the standard upload URL response, with storage IDs bound by this trusted endpoint. */
export const receive = httpAction(async (ctx, request) => {
  const token = new URL(request.url).searchParams.get('token')
  if (!token || token.length > 100) return new Response('Invalid upload URL.', { status: 400 })
  let storageId: Id<'_storage'> | null = null
  try {
    const intentId = await ctx.runMutation(internal.verificationEntries.uploads.claim, { token })
    const reader = request.body?.getReader()
    if (!reader) return new Response('A file is required.', { status: 400 })
    const chunks: Uint8Array<ArrayBuffer>[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > ATTACHMENT_UPLOAD_MAX_BYTES) {
        await reader.cancel()
        return new Response('Attachment exceeds the file size limit.', { status: 413 })
      }
      chunks.push(new Uint8Array(value))
    }
    if (!size) return new Response('The file is empty.', { status: 400 })
    const contentType = request.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream'
    storageId = await ctx.storage.store(new Blob(chunks, { type: contentType }))
    await ctx.runMutation(internal.verificationEntries.uploads.complete, { intentId, storageId, contentType })
    return Response.json({ storageId }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    if (storageId) await ctx.storage.delete(storageId)
    return new Response('Upload is unavailable. Start a new upload.', { status: 403 })
  }
})
