import type { WebhookEventPayload } from 'resend'

export const resendWebhookCategories = ['email', 'contact', 'domain', 'suppression'] as const

export type ResendWebhookCategory = (typeof resendWebhookCategories)[number]

export interface ResendWebhookRecord {
  category: ResendWebhookCategory
  detail?: string
  eventCreatedAt: string
  eventType: string
  recipientCount?: number
  resourceId: string
  source?: string
  subject?: string
  target?: string
  webhookId: string
}

const textEncoder = new TextEncoder()

function normalizeText(value: string | null | undefined, maximumLength: number) {
  const normalized = value?.trim()

  return normalized ? normalized.slice(0, maximumLength) : undefined
}

function getEmailEventDetail(event: Extract<WebhookEventPayload, { type: `email.${string}` }>) {
  switch (event.type) {
    case 'email.bounced':
      return event.data.bounce.type
    case 'email.clicked':
      return event.data.click.link
    case 'email.failed':
      return event.data.failed.reason
    case 'email.suppressed':
      return event.data.suppressed.type
    default:
      return undefined
  }
}

export function buildResendWebhookRecord(
  event: WebhookEventPayload,
  webhookId: string
): ResendWebhookRecord {
  if (event.type.startsWith('email.')) {
    const emailEvent = event as Extract<WebhookEventPayload, { type: `email.${string}` }>

    return {
      category: 'email',
      detail: normalizeText(getEmailEventDetail(emailEvent), 1024),
      eventCreatedAt: event.created_at,
      eventType: event.type,
      recipientCount: emailEvent.data.to.length,
      resourceId: normalizeText(emailEvent.data.email_id, 256) ?? webhookId,
      source: normalizeText(emailEvent.data.from, 512),
      subject: normalizeText(emailEvent.data.subject, 998),
      target: normalizeText(emailEvent.data.to[0], 512),
      webhookId
    }
  }

  if (event.type.startsWith('contact.')) {
    const contactEvent = event as Extract<WebhookEventPayload, { type: `contact.${string}` }>

    return {
      category: 'contact',
      detail: contactEvent.data.unsubscribed ? 'Unsubscribed' : 'Subscribed',
      eventCreatedAt: event.created_at,
      eventType: event.type,
      resourceId: normalizeText(contactEvent.data.id, 256) ?? webhookId,
      source: normalizeText(contactEvent.data.audience_id, 512),
      target: normalizeText(contactEvent.data.email, 512),
      webhookId
    }
  }

  if (event.type.startsWith('domain.')) {
    const domainEvent = event as Extract<WebhookEventPayload, { type: `domain.${string}` }>

    return {
      category: 'domain',
      detail: normalizeText(domainEvent.data.status, 1024),
      eventCreatedAt: event.created_at,
      eventType: event.type,
      resourceId: normalizeText(domainEvent.data.id, 256) ?? webhookId,
      target: normalizeText(domainEvent.data.name, 512),
      webhookId
    }
  }

  const suppressionEvent = event as Extract<WebhookEventPayload, { type: `suppression.${string}` }>

  return {
    category: 'suppression',
    detail: normalizeText(suppressionEvent.data.origin, 1024),
    eventCreatedAt: event.created_at,
    eventType: event.type,
    resourceId: normalizeText(suppressionEvent.data.id, 256) ?? webhookId,
    target: normalizeText(suppressionEvent.data.email, 512),
    webhookId
  }
}

function serializeRecord(record: ResendWebhookRecord) {
  return JSON.stringify([
    record.category,
    record.detail ?? null,
    record.eventCreatedAt,
    record.eventType,
    record.recipientCount ?? null,
    record.resourceId,
    record.source ?? null,
    record.subject ?? null,
    record.target ?? null,
    record.webhookId
  ])
}

async function importSigningKey(secret: string, usage: KeyUsage) {
  return await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    [usage]
  )
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(value: string) {
  if (!/^[a-f\d]{64}$/i.test(value)) {
    return null
  }

  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16))
}

export async function signResendWebhookRecord(record: ResendWebhookRecord, secret: string) {
  const key = await importSigningKey(secret, 'sign')
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(serializeRecord(record)))

  return bytesToHex(signature)
}

export async function verifyResendWebhookRecord(
  record: ResendWebhookRecord,
  secret: string,
  signature: string
) {
  const signatureBytes = hexToBytes(signature)

  if (!signatureBytes) {
    return false
  }

  const key = await importSigningKey(secret, 'verify')

  return await crypto.subtle.verify('HMAC', key, signatureBytes, textEncoder.encode(serializeRecord(record)))
}
