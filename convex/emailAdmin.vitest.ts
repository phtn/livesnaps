/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('/convex/**/*.ts')
const god = { subject: 'god', god: true }
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

test('test sends reject anonymous, ordinary and admin-only callers before delivery', async () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const t = convexTest(schema, modules)
  const args = { template: 'account-invite' as const, recipient: 'test@example.com' }
  await expect(t.action(api.emailAdmin.sendTest, args)).rejects.toThrow('Citadel access')
  for (const identity of [{ subject: 'user' }, { subject: 'admin', admin: true }]) {
    await expect(t.withIdentity(identity).action(api.emailAdmin.sendTest, args)).rejects.toThrow('Citadel access')
  }
  expect(fetchMock).not.toHaveBeenCalled()
})

test('god sends each real template with test subject and normalized single recipient', async () => {
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  const t = convexTest(schema, modules).withIdentity(god)
  for (const template of ['account-invite', 'admin-confirmation', 'submission-link'] as const) {
    await t.action(api.emailAdmin.sendTest, { template, recipient: ' Test@Example.com ' })
    const payload = JSON.parse(fetchMock.mock.lastCall![1].body)
    expect(payload.to).toEqual(['test@example.com'])
    expect(payload.subject).toMatch(/^\[TEST\] /)
    expect(payload.html).toContain('/f_png/')
    expect(payload.html).toContain('https://example.com/livesnaps-email-test')
    expect(payload.text).toContain('Sample account')
  }
})

test('invalid recipient and provider failure do not report success', async () => {
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  const fetchMock = vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 }))
  vi.stubGlobal('fetch', fetchMock)
  const t = convexTest(schema, modules).withIdentity(god)
  await expect(t.action(api.emailAdmin.sendTest, { template: 'account-invite', recipient: 'invalid' })).rejects.toThrow('valid recipient')
  expect(fetchMock).not.toHaveBeenCalled()
  await expect(t.action(api.emailAdmin.sendTest, { template: 'account-invite', recipient: 'test@example.com' })).rejects.toThrow('Resend API failed')
})

test('webhook history protects event data and supports god access, filters and pagination', async () => {
  const t = convexTest(schema, modules)
  await t.run(async ctx => {
    for (let i = 0; i < 3; i++) await ctx.db.insert('resendWebhooks', {
      category: 'email', eventCreatedAt: '2026-09-12T00:00:00Z',
      eventType: i === 0 ? 'email.sent' : 'email.delivered', receivedAt: i,
      resourceId: `email-${i}`, webhookId: `webhook-${i}`, target: 'test@example.com'
    })
  })
  const args = { paginationOpts: { numItems: 2, cursor: null } }
  await expect(t.query(api.resendWebhooks.q.list, args)).rejects.toThrow('Unauthorized')
  await expect(t.withIdentity({ subject: 'user' }).query(api.resendWebhooks.q.list, args)).rejects.toThrow('Unauthorized')
  const staff = t.withIdentity(god)
  const first = await staff.query(api.resendWebhooks.q.list, args)
  expect(first.page.map(event => event.webhookId)).toEqual(['webhook-2', 'webhook-1'])
  const second = await staff.query(api.resendWebhooks.q.list, { paginationOpts: { numItems: 2, cursor: first.continueCursor } })
  expect(second.page.map(event => event.webhookId)).toEqual(['webhook-0'])
  const filtered = await staff.query(api.resendWebhooks.q.list, { ...args, eventType: 'email.sent' })
  expect(filtered.page.map(event => event.webhookId)).toEqual(['webhook-0'])
  await expect(t.withIdentity({ subject: 'admin', admin: true }).query(api.resendWebhooks.q.list, args)).resolves.toBeDefined()
})
