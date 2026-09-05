import { createClient } from '@/lib/resend'
import type { WebhookEventPayload } from 'resend'

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
  webhookId: string
}

export class ResendWebhookConfigurationError extends Error {
  constructor(options?: ErrorOptions) {
    super('The Resend API client is not configured.', options)
    this.name = 'ResendWebhookConfigurationError'
  }
}

/**
 * Verify the original, unparsed request body. Parsing and serializing the
 * payload before this call changes the signed bytes and invalidates the
 * webhook signature.
 */
export function verifyResendWebhook({
  headers,
  payload,
  webhookSecret
}: VerifyResendWebhookOptions): WebhookEventPayload {
  let resend: ReturnType<typeof createClient>

  try {
    resend = createClient()
  } catch (error) {
    throw new ResendWebhookConfigurationError({ cause: error })
  }

  return resend.webhooks.verify({ headers, payload, webhookSecret })
}

/**
 * Central processing boundary for verified Resend events.
 *
 * Resend can deliver an event more than once. Any durable side effect added
 * here must use webhookId as an idempotency key before applying the change.
 */
export async function handleResendWebhookEvent({ event, webhookId }: HandleResendWebhookEventOptions) {
  console.info('[resend/webhook] verified event', {
    createdAt: event.created_at,
    eventType: event.type,
    webhookId
  })
}
