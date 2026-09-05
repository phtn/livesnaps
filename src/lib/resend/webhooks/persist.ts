import { api } from 'convex/_generated/api'
import { fetchMutation } from 'convex/nextjs'
import type { WebhookEventPayload } from 'resend'
import { isTrackedResendWebhookEventType } from './events'
import { buildResendWebhookRecord, signResendWebhookRecord } from './record'

interface PersistResendWebhookEventOptions {
  event: WebhookEventPayload
  webhookId: string
  webhookSecret: string
}

export async function persistResendWebhookEvent({ event, webhookId, webhookSecret }: PersistResendWebhookEventOptions) {
  // Persist all verified Resend events — no longer filtered to tracked types
  // isTracked check kept for UI grouping but not for ingestion
  void isTrackedResendWebhookEventType

  const record = buildResendWebhookRecord(event, webhookId)
  const ingestSignature = await signResendWebhookRecord(record, webhookSecret)

  const result = await fetchMutation(api.resendWebhooks.m.record, {
    category: record.category,
    eventCreatedAt: record.eventCreatedAt,
    eventType: record.eventType,
    ingestSignature,
    resourceId: record.resourceId,
    webhookId: record.webhookId,
    ...(record.detail === undefined ? {} : { detail: record.detail }),
    ...(record.recipientCount === undefined ? {} : { recipientCount: record.recipientCount }),
    ...(record.source === undefined ? {} : { source: record.source }),
    ...(record.subject === undefined ? {} : { subject: record.subject }),
    ...(record.target === undefined ? {} : { target: record.target })
  })

  return { ignored: false, ...result }
}
