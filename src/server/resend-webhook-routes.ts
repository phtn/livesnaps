import {
  handleResendWebhookEvent,
  ResendWebhookConfigurationError,
  verifyResendWebhook,
  WebhookVerificationError
} from '@/lib/resend/webhooks'
import { createConvexClient } from './convex'

export interface ResendWebhookRouteEnvironment {
  convexUrl?: string
  resendWebhookSecret?: string
}

/**
 * Resend signs with the Standard Webhooks scheme. It has historically sent the
 * `svix-*` header names and now also sends the vendor-neutral `webhook-*` ones,
 * so both are accepted — a delivery is dropped only when neither triple is
 * present.
 */
const SIGNATURE_HEADERS = [
  { id: 'webhook-id', signature: 'webhook-signature', timestamp: 'webhook-timestamp' },
  { id: 'svix-id', signature: 'svix-signature', timestamp: 'svix-timestamp' }
] as const

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' }
  })

function readSignatureHeaders(request: Request) {
  for (const names of SIGNATURE_HEADERS) {
    const id = request.headers.get(names.id)
    const signature = request.headers.get(names.signature)
    const timestamp = request.headers.get(names.timestamp)

    if (id && signature && timestamp) {
      return { id, signature, timestamp }
    }
  }

  return null
}

/**
 * Ingests a Resend webhook delivery.
 *
 * The body is read as text and handed to verification untouched: parsing and
 * re-serializing it would change the signed bytes. Everything past verification
 * is idempotent on `webhookId`, because Resend retries and can deliver the same
 * event more than once.
 *
 * Status codes matter to the sender. A 4xx tells Resend not to retry (a bad
 * signature will never become good); a 5xx asks it to retry, which is what a
 * transient Convex failure deserves.
 */
export async function handleResendWebhook(
  request: Request,
  environment: ResendWebhookRouteEnvironment = {}
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }

  const webhookSecret = environment.resendWebhookSecret?.trim() || process.env.RESEND_WEBHOOK_SECRET?.trim()

  if (!webhookSecret) {
    console.error('[resend/webhook] RESEND_WEBHOOK_SECRET is not configured')
    return json({ error: 'Webhook ingestion is not configured.' }, 500)
  }

  const headers = readSignatureHeaders(request)

  if (!headers) {
    return json({ error: 'Missing webhook signature headers.' }, 400)
  }

  const payload = await request.text()

  let event: ReturnType<typeof verifyResendWebhook>

  try {
    event = verifyResendWebhook({ headers, payload, webhookSecret })
  } catch (error) {
    if (error instanceof ResendWebhookConfigurationError) {
      console.error('[resend/webhook] webhook secret is unusable', error)
      return json({ error: 'Webhook ingestion is not configured.' }, 500)
    }

    if (error instanceof WebhookVerificationError) {
      console.warn('[resend/webhook] rejected delivery', {
        reason: error.message,
        webhookId: headers.id
      })

      // The reason is echoed into the body on purpose. Resend records each
      // attempt's response, and that log is readable over its API — which makes
      // this the only practical way to tell a clock-skew rejection apart from a
      // secret mismatch on a deployment whose logs are not reachable. The
      // message names the failure mode and nothing about the secret itself.
      return json({ error: 'Invalid webhook signature.', reason: error.message }, 401)
    }

    console.warn('[resend/webhook] unreadable delivery', {
      webhookId: headers.id
    })
    return json({ error: 'Invalid webhook payload.' }, 400)
  }

  try {
    const result = await handleResendWebhookEvent({
      event,
      persistence: createConvexClient(undefined, environment.convexUrl),
      webhookId: headers.id,
      webhookSecret
    })

    return json({ ok: true, duplicate: result.duplicate })
  } catch (error) {
    console.error('[resend/webhook] failed to persist event', {
      error: error instanceof Error ? error.message : String(error),
      eventType: event.type,
      webhookId: headers.id
    })

    return json({ error: 'Unable to record webhook event.' }, 500)
  }
}
