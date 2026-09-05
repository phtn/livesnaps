import { v } from 'convex/values'

export const resendWebhookCategoryValidator = v.union(
  v.literal('email'),
  v.literal('contact'),
  v.literal('domain'),
  v.literal('suppression')
)

export const trackedResendWebhookEventTypeValidator = v.union(
  v.literal('email.sent'),
  v.literal('email.delivered'),
  v.literal('email.delivery_delayed'),
  v.literal('email.opened'),
  v.literal('email.clicked'),
  v.literal('email.bounced'),
  v.literal('email.complained'),
  v.literal('email.failed'),
  v.literal('email.suppressed'),
  v.literal('contact.created'),
  v.literal('contact.updated'),
  v.literal('contact.deleted'),
  v.literal('domain.created'),
  v.literal('domain.updated'),
  v.literal('domain.deleted'),
  v.literal('suppression.created'),
  v.literal('suppression.deleted')
)

export const resendWebhookEventSchema = v.object({
  category: resendWebhookCategoryValidator,
  detail: v.optional(v.string()),
  eventCreatedAt: v.string(),
  eventType: v.string(),
  receivedAt: v.number(),
  recipientCount: v.optional(v.number()),
  resourceId: v.string(),
  source: v.optional(v.string()),
  subject: v.optional(v.string()),
  target: v.optional(v.string()),
  webhookId: v.string()
})
