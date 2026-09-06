import type { WebhookEventPayload } from 'resend'
import { Webhook, WebhookVerificationError } from 'standardwebhooks'
import type { ResendWebhookPersistence } from './persist'
import { persistResendWebhookEvent } from './persist'

export interface ResendWebhookHeaders {
  id: string
  signature: string
  timestamp: string
}

interface VerifyResendWebhookOptions {
  headers: ResendWebhookHeaders
  payload: string
  webhookSecret: string
}

interface HandleResendWebhookEventOptions {
  event: WebhookEventPayload
  persistence: ResendWebhookPersistence
  webhookId: string
  webhookSecret: string
}

export class ResendWebhookConfigurationError extends Error {
  constructor(options?: ErrorOptions) {
    super('The Resend webhook secret is not configured.', options)
    this.name = 'ResendWebhookConfigurationError'
  }
}

export { WebhookVerificationError }

/**
 * Verify the original, unparsed request body. Parsing and serializing the
 * payload before this call changes the signed bytes and invalidates the
 * webhook signature.
 *
 * This deliberately uses the Standard Webhooks primitive rather than
 * `resend.webhooks.verify`: the Resend client constructor demands an API key,
 * and signature verification needs only the webhook secret. Requiring the send
 * key here would make webhook ingestion fail on any deployment that only
 * receives.
 */
export function verifyResendWebhook({
  headers,
  payload,
  webhookSecret
}: VerifyResendWebhookOptions): WebhookEventPayload {
  if (!webhookSecret.trim()) {
    throw new ResendWebhookConfigurationError()
  }

  let webhook: Webhook

  try {
    webhook = new Webhook(webhookSecret.trim())
  } catch (error) {
    throw new ResendWebhookConfigurationError({ cause: error })
  }

  return webhook.verify(payload, {
    'webhook-id': headers.id,
    'webhook-signature': headers.signature,
    'webhook-timestamp': headers.timestamp
  }) as WebhookEventPayload
}

/**
 * Central processing boundary for verified Resend events.
 *
 * Resend can deliver an event more than once. Any durable side effect added
 * here must use webhookId as an idempotency key before applying the change —
 * `resendWebhooks.m.record` does exactly that, and reports `duplicate` rather
 * than inserting a second row.
 */
export async function handleResendWebhookEvent({
  event,
  persistence,
  webhookId,
  webhookSecret
}: HandleResendWebhookEventOptions) {
  const result = await persistResendWebhookEvent({
    event,
    persistence,
    webhookId,
    webhookSecret
  })

  console.info('[resend/webhook] verified event', {
    createdAt: event.created_at,
    duplicate: result.duplicate,
    eventType: event.type,
    webhookId
  })

  return result
}
