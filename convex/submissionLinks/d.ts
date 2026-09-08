import { v } from 'convex/values'

export const submissionLinkSchema = v.object({
  accountId: v.id('accounts'),
  // The empty slug is the Account's default /account-slug link.
  slug: v.string(),
  label: v.string(),
  enabled: v.boolean(),
  createdAt: v.number(),
  createdBy: v.string(),
  updatedAt: v.number(),
  updatedBy: v.string()
})

export const submissionLinkSummarySchema = submissionLinkSchema.pick('slug', 'label', 'enabled').extend({
  _id: v.id('submissionLinks')
})

export const submissionCountsSchema = v.object({
  started: v.number(),
  completed: v.number(),
  abandoned: v.number(),
  cancelled: v.number(),
  invalidated: v.number()
})

export const submissionLinkDailyStatsSchema = submissionCountsSchema.extend({
  accountId: v.id('accounts'),
  submissionLinkId: v.id('submissionLinks'),
  // UTC session-start day: completion rates compare the same cohort.
  day: v.string()
})

export const accountSlugReservationSchema = v.object({
  slug: v.string(),
  accountId: v.id('accounts')
})

export type SubmissionCounts = typeof submissionCountsSchema.type
