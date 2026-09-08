import { ConvexError } from 'convex/values'
import { canUseAccount } from '../../src/lib/accounts/accounts'
import {
  isPublicAccountSlug,
  isSubmissionLinkSlug,
  SUBMISSION_LINK_LABEL_MAX_LENGTH
} from '../../src/lib/accounts/submission-links'
import { DEFAULT_SUBMISSION_LINK_COLOR } from '../../src/lib/accounts/submission-links'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { getAccountBySlug } from '../accounts/helpers'
import type { SubmissionCounts } from './d'

type Ctx = QueryCtx | MutationCtx
export const emptySubmissionCounts = (): SubmissionCounts => ({
  started: 0,
  completed: 0,
  abandoned: 0,
  cancelled: 0,
  invalidated: 0
})

export const getSubmissionLink = (ctx: Ctx, accountId: Id<'accounts'>, slug: string) =>
  ctx.db
    .query('submissionLinks')
    .withIndex('by_accountId_and_slug', (q) => q.eq('accountId', accountId).eq('slug', slug))
    .unique()

export const resolveSubmissionDestination = async (ctx: Ctx, accountSlug: string, linkSlug = '') => {
  if (!isPublicAccountSlug(accountSlug) || (linkSlug !== '' && !isSubmissionLinkSlug(linkSlug))) return null
  const account = await getAccountBySlug(ctx, accountSlug)
  if (!account) return null
  const link = await getSubmissionLink(ctx, account._id, linkSlug)
  // Existing Accounts acquire a persistent default link on first use.
  if (!link && linkSlug !== '') return null
  return { account, link, available: canUseAccount(account.status) && (link?.enabled ?? true) }
}

export const ensureDefaultSubmissionLink = async (
  ctx: MutationCtx,
  accountId: Id<'accounts'>,
  tokenIdentifier: string
) => {
  const existing = await getSubmissionLink(ctx, accountId, '')
  if (existing) return existing
  const now = Date.now()
  const linkId = await ctx.db.insert('submissionLinks', {
    accountId,
    slug: '',
    label: 'Default link',
    color: DEFAULT_SUBMISSION_LINK_COLOR,
    enabled: true,
    createdAt: now,
    createdBy: tokenIdentifier,
    updatedAt: now,
    updatedBy: tokenIdentifier
  })
  const link = await ctx.db.get(linkId)
  if (!link) throw new ConvexError('Unable to create the default submission link.')
  return link
}

export const normalizeLinkLabel = (label: string) => {
  const trimmed = label.trim()
  if (!trimmed || trimmed.length > SUBMISSION_LINK_LABEL_MAX_LENGTH) {
    throw new ConvexError(`Link label must contain 1–${SUBMISSION_LINK_LABEL_MAX_LENGTH} characters.`)
  }
  return trimmed
}

export const recordSubmissionEvent = async (
  ctx: MutationCtx,
  snap: Pick<Doc<'snaps'>, 'accountId' | 'submissionLinkId' | 'location_session'>,
  event: keyof SubmissionCounts
) => {
  // Historical unowned records remain outside Account analytics.
  if (!snap.accountId || !snap.submissionLinkId || !snap.location_session) return
  const accountId = snap.accountId
  const submissionLinkId = snap.submissionLinkId
  const day = new Date(snap.location_session.started_at).toISOString().slice(0, 10)
  const existing = await ctx.db
    .query('submissionLinkDailyStats')
    .withIndex('by_accountId_and_submissionLinkId_and_day', (q) =>
      q.eq('accountId', accountId).eq('submissionLinkId', submissionLinkId).eq('day', day)
    )
    .unique()
  if (existing) {
    await ctx.db.patch(existing._id, { [event]: existing[event] + 1 })
  } else {
    await ctx.db.insert('submissionLinkDailyStats', {
      accountId,
      submissionLinkId,
      day,
      ...emptySubmissionCounts(),
      [event]: 1
    })
  }
}
