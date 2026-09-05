import assert from 'node:assert/strict'
import test from 'node:test'
import { countEmailSentEventsByTarget } from './sent-counts'

test('counts email.sent webhook events by normalized target email', () => {
  const counts = countEmailSentEventsByTarget(
    [
      { eventType: 'email.sent', target: 'PLAYER@example.com' },
      { eventType: 'email.sent', target: ' player@example.com ' },
      { eventType: 'email.delivered', target: 'player@example.com' },
      { eventType: 'email.sent', target: 'contact@example.com' },
      { eventType: 'email.sent', target: 'other@example.com' }
    ],
    ['player@example.com', 'CONTACT@example.com']
  )

  assert.deepEqual(counts, [
    { email: 'player@example.com', sentCount: 2 },
    { email: 'contact@example.com', sentCount: 1 }
  ])
})
