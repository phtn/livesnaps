import { ConvexError, v } from 'convex/values'
import { DEFAULT_SUBMISSION_LINK_COLOR, isSubmissionLinkSlug, MAX_ACCOUNT_SUBMISSION_LINKS } from '../../src/lib/accounts/submission-links'
import { mutation } from '../_generated/server'
import { requireSubmissionAccountAccess } from '../lib/submissionAccess'
import { submissionLinkColorSchema } from './d'
import { ensureDefaultSubmissionLink, getSubmissionLink, normalizeLinkLabel } from './helpers'

export const ensureDefault = mutation({
  args: { accountId: v.id('accounts') },
  returns: v.id('submissionLinks'),
  handler: async (ctx, { accountId }) => {
    const { identity } = await requireSubmissionAccountAccess(ctx, accountId)
    return (await ensureDefaultSubmissionLink(ctx, accountId, identity.tokenIdentifier))._id
  }
})

export const create = mutation({
  args: { accountId: v.id('accounts'), slug: v.string(), label: v.string(), color: v.optional(submissionLinkColorSchema) },
  returns: v.id('submissionLinks'),
  handler: async (ctx, { accountId, slug, label, color }) => {
    const { identity } = await requireSubmissionAccountAccess(ctx, accountId, 'admin')
    const normalizedSlug = slug.trim().toLowerCase()
    if (!isSubmissionLinkSlug(normalizedSlug)) {
      throw new ConvexError('Link slug must use lowercase letters, numbers, and single hyphens (up to 63 characters).')
    }
    const normalizedLabel = normalizeLinkLabel(label)
    await ensureDefaultSubmissionLink(ctx, accountId, identity.tokenIdentifier)
    if (await getSubmissionLink(ctx, accountId, normalizedSlug)) {
      throw new ConvexError('This Account already has a link with that slug.')
    }
    const existing = await ctx.db
      .query('submissionLinks')
      .withIndex('by_accountId_and_slug', (q) => q.eq('accountId', accountId))
      .take(MAX_ACCOUNT_SUBMISSION_LINKS)
    if (existing.length >= MAX_ACCOUNT_SUBMISSION_LINKS) {
      throw new ConvexError(`An Account can have up to ${MAX_ACCOUNT_SUBMISSION_LINKS} submission links.`)
    }
    const now = Date.now()
    return await ctx.db.insert('submissionLinks', {
      accountId,
      slug: normalizedSlug,
      label: normalizedLabel,
      color: color ?? DEFAULT_SUBMISSION_LINK_COLOR,
      enabled: true,
      createdAt: now,
      createdBy: identity.tokenIdentifier,
      updatedAt: now,
      updatedBy: identity.tokenIdentifier
    })
  }
})

export const update = mutation({
  args: { linkId: v.id('submissionLinks'), label: v.optional(v.string()), color: v.optional(submissionLinkColorSchema), enabled: v.optional(v.boolean()) },
  returns: v.id('submissionLinks'),
  handler: async (ctx, { linkId, label, color, enabled }) => {
    const link = await ctx.db.get(linkId)
    if (!link) throw new ConvexError('Submission link not found.')
    const { identity } = await requireSubmissionAccountAccess(ctx, link.accountId, 'admin')
    await ctx.db.patch(linkId, {
      ...(label === undefined ? {} : { label: normalizeLinkLabel(label) }),
      ...(color === undefined ? {} : { color }),
      ...(enabled === undefined ? {} : { enabled }),
      updatedAt: Date.now(),
      updatedBy: identity.tokenIdentifier
    })
    return linkId
  }
})
