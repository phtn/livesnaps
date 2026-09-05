import { ConvexError, v } from 'convex/values'
import { type ResendWebhookRecord, verifyResendWebhookRecord } from '../../src/lib/resend/webhooks/record'
import { env, mutation } from '../_generated/server'
import { resendWebhookCategoryValidator } from './d'

const optionalStringLengths = {
  detail: 1024,
  source: 512,
  subject: 998,
  target: 512
} as const

function assertMaximumLength(label: string, value: string | undefined, maximumLength: number) {
  if (value !== undefined && value.length > maximumLength) {
    throw new ConvexError(`${label} is too long.`)
  }
}

export const record = mutation({
  args: {
    category: resendWebhookCategoryValidator,
    detail: v.optional(v.string()),
    eventCreatedAt: v.string(),
    eventType: v.string(),
    ingestSignature: v.string(),
    recipientCount: v.optional(v.number()),
    resourceId: v.string(),
    source: v.optional(v.string()),
    subject: v.optional(v.string()),
    target: v.optional(v.string()),
    webhookId: v.string()
  },
  handler: async (ctx, { ingestSignature, ...record }) => {
    assertMaximumLength('Webhook ID', record.webhookId, 256)
    assertMaximumLength('Event type', record.eventType, 128)
    assertMaximumLength('Event creation date', record.eventCreatedAt, 64)
    assertMaximumLength('Resource ID', record.resourceId, 256)

    for (const [field, maximumLength] of Object.entries(optionalStringLengths)) {
      assertMaximumLength(field, record[field as keyof typeof optionalStringLengths], maximumLength)
    }

    if (!Number.isFinite(Date.parse(record.eventCreatedAt))) {
      throw new ConvexError('Event creation date is invalid.')
    }

    if (
      record.recipientCount !== undefined &&
      (!Number.isInteger(record.recipientCount) || record.recipientCount < 0)
    ) {
      throw new ConvexError('Recipient count is invalid.')
    }

    const authorized = await verifyResendWebhookRecord(
      record as ResendWebhookRecord,
      env.RESEND_WEBHOOK_SECRET,
      ingestSignature
    )

    if (!authorized) {
      throw new ConvexError('Unauthorized')
    }

    const existing = await ctx.db
      .query('resendWebhooks')
      .withIndex('by_webhookId', (query) => query.eq('webhookId', record.webhookId))
      .unique()

    if (existing) {
      return { duplicate: true, id: existing._id }
    }

    const id = await ctx.db.insert('resendWebhooks', {
      ...record,
      receivedAt: Date.now()
    })

    return { duplicate: false, id }
  }
})
