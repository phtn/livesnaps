import assert from 'node:assert/strict'
import test from 'node:test'
import type { WebhookEventPayload } from 'resend'
import { isTrackedResendWebhookEventType, trackedResendWebhookEventTypes } from './events'
import { buildResendWebhookRecord, signResendWebhookRecord, verifyResendWebhookRecord } from './record'

const deliveredEvent = {
  created_at: '2026-08-01T04:00:00.000Z',
  data: {
    created_at: '2026-08-01T04:00:00.000Z',
    email_id: 'email_test',
    from: 'Foreplay <hello@foreplay.pro>',
    subject: 'Tournament update',
    to: ['golfer@example.com', 'partner@example.com']
  },
  type: 'email.delivered'
} as unknown as WebhookEventPayload

test('builds a compact email event record for the admin inbox', () => {
  assert.deepEqual(buildResendWebhookRecord(deliveredEvent, 'webhook_test'), {
    category: 'email',
    detail: undefined,
    eventCreatedAt: '2026-08-01T04:00:00.000Z',
    eventType: 'email.delivered',
    recipientCount: 2,
    resourceId: 'email_test',
    source: 'Foreplay <hello@foreplay.pro>',
    subject: 'Tournament update',
    target: 'golfer@example.com',
    webhookId: 'webhook_test'
  })
})

test('ingest signatures cover every stored field', async () => {
  const secret = 'whsec_record_test'
  const record = buildResendWebhookRecord(deliveredEvent, 'webhook_test')
  const signature = await signResendWebhookRecord(record, secret)

  assert.equal(await verifyResendWebhookRecord(record, secret, signature), true)
  assert.equal(await verifyResendWebhookRecord({ ...record, target: 'attacker@example.com' }, secret, signature), false)
  assert.equal(await verifyResendWebhookRecord(record, secret, 'not-a-signature'), false)
})

test('tracks the five configured email webhook events', () => {
  assert.deepEqual(trackedResendWebhookEventTypes, [
    'email.sent',
    'email.delivered',
    'email.opened',
    'email.failed',
    'email.bounced'
  ])
  assert.equal(isTrackedResendWebhookEventType('email.delivered'), true)
  assert.equal(isTrackedResendWebhookEventType('email.clicked'), false)
})
