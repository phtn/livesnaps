import { ConvexError, v } from 'convex/values'
import { MAX_ACCOUNT_SUBMISSION_LINKS, MAX_SUBMISSION_ANALYTICS_DAYS } from '../../src/lib/accounts/submission-links'
import { query } from '../_generated/server'
import { requireSubmissionAccountAccess } from '../lib/submissionAccess'
import { type SubmissionCounts, submissionCountsSchema, submissionLinkSummarySchema } from './d'
import { emptySubmissionCounts, resolveSubmissionDestination } from './helpers'

export const resolvePublic = query({
  args: { accountSlug: v.string(), linkSlug: v.optional(v.string()) },
  returns: v.union(
    v.null(),
    v.object({
      accountId: v.id('accounts'),
      accountName: v.string(),
      accountSlug: v.string(),
      linkSlug: v.string(),
      label: v.string(),
      available: v.boolean()
    })
  ),
  handler: async (ctx, { accountSlug, linkSlug }) => {
    const destination = await resolveSubmissionDestination(ctx, accountSlug, linkSlug)
    if (!destination) return null
    return {
      accountId: destination.account._id,
      accountName: destination.account.name,
      accountSlug: destination.account.slug,
      linkSlug: destination.link?.slug ?? '',
      label: destination.link?.label ?? 'Default link',
      available: destination.available
    }
  }
})

export const list = query({
  args: { accountId: v.id('accounts') },
  returns: v.object({ canManage: v.boolean(), links: v.array(submissionLinkSummarySchema) }),
  handler: async (ctx, { accountId }) => {
    const { canManage } = await requireSubmissionAccountAccess(ctx, accountId)
    const links = await ctx.db
      .query('submissionLinks')
      .withIndex('by_accountId_and_slug', (q) => q.eq('accountId', accountId))
      .take(MAX_ACCOUNT_SUBMISSION_LINKS)
    return { canManage, links: links.map(({ _id, slug, label, enabled }) => ({ _id, slug, label, enabled })) }
  }
})

const parseDay = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ConvexError('Use YYYY-MM-DD analytics dates.')
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new ConvexError('Analytics dates must be valid UTC calendar days.')
  }
  return timestamp
}
const addCounts = (target: SubmissionCounts, source: SubmissionCounts) => {
  for (const key of Object.keys(target) as Array<keyof SubmissionCounts>) target[key] += source[key]
}

export const analytics = query({
  args: { accountId: v.id('accounts'), fromDay: v.string(), toDay: v.string() },
  returns: v.object({
    fromDay: v.string(),
    toDay: v.string(),
    totals: submissionCountsSchema,
    links: v.array(
      submissionCountsSchema.extend({
        linkId: v.id('submissionLinks'),
        slug: v.string(),
        label: v.string(),
        enabled: v.boolean()
      })
    ),
    days: v.array(submissionCountsSchema.extend({ day: v.string() }))
  }),
  handler: async (ctx, { accountId, fromDay, toDay }) => {
    await requireSubmissionAccountAccess(ctx, accountId)
    const from = parseDay(fromDay)
    const to = parseDay(toDay)
    const dayCount = (to - from) / 86_400_000 + 1
    if (dayCount < 1 || dayCount > MAX_SUBMISSION_ANALYTICS_DAYS) {
      throw new ConvexError(`Choose an analytics range of 1–${MAX_SUBMISSION_ANALYTICS_DAYS} days.`)
    }
    const links = await ctx.db
      .query('submissionLinks')
      .withIndex('by_accountId_and_slug', (q) => q.eq('accountId', accountId))
      .take(MAX_ACCOUNT_SUBMISSION_LINKS)
    const stats = await ctx.db
      .query('submissionLinkDailyStats')
      .withIndex('by_accountId_and_day', (q) => q.eq('accountId', accountId).gte('day', fromDay).lte('day', toDay))
      .take(MAX_ACCOUNT_SUBMISSION_LINKS * MAX_SUBMISSION_ANALYTICS_DAYS)
    const totals = emptySubmissionCounts()
    const byLink = new Map(links.map((link) => [link._id, emptySubmissionCounts()]))
    const byDay = new Map<string, SubmissionCounts>()
    for (let day = from; day <= to; day += 86_400_000) {
      byDay.set(new Date(day).toISOString().slice(0, 10), emptySubmissionCounts())
    }
    for (const stat of stats) {
      addCounts(totals, stat)
      const linkCounts = byLink.get(stat.submissionLinkId)
      if (linkCounts) addCounts(linkCounts, stat)
      const dayCounts = byDay.get(stat.day)
      if (dayCounts) addCounts(dayCounts, stat)
    }
    return {
      fromDay,
      toDay,
      totals,
      links: links.map(({ _id, slug, label, enabled }) => ({
        linkId: _id,
        slug,
        label,
        enabled,
        ...(byLink.get(_id) ?? emptySubmissionCounts())
      })),
      days: [...byDay].map(([day, counts]) => ({ day, ...counts }))
    }
  }
})
