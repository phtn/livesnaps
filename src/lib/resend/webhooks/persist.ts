import type { ConvexHttpClient } from 'convex/browser'
import type { WebhookEventPayload } from 'resend'
import { api } from '../../../../convex/_generated/api'
import { buildResendWebhookRecord, signResendWebhookRecord } from './record'

/**
 * The Convex client used to write the event. Structural rather than concrete so
 * a caller can pass an authenticated client, and so tests can pass a double —
 * `resendWebhooks.m.record` is public and gated by the ingest HMAC, not by a
 * Convex identity.
 */
export type ResendWebhookPersistence = Pick<ConvexHttpClient, 'mutation'>

interface PersistResendWebhookEventOptions {
  event: WebhookEventPayload
  persistence: ResendWebhookPersistence
  webhookId: string
  webhookSecret: string
}

export async function persistResendWebhookEvent({
  event,
  persistence,
  webhookId,
  webhookSecret
}: PersistResendWebhookEventOptions) {
  // Every verified Resend event is persisted, not just the tracked subset —
  // `trackedResendWebhookEventTypes` groups the table for the UI, it does not
  // decide what gets ingested.
  const record = buildResendWebhookRecord(event, webhookId)
  const ingestSignature = await signResendWebhookRecord(record, webhookSecret)

  return await persistence.mutation(api.resendWebhooks.m.record, {
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
}
