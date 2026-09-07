import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { convexTest } from 'convex-test'
import { api, internal } from '../convex/_generated/api'
import schema from '../convex/schema'
import { canUseAccount } from '../src/lib/accounts/accounts'
import { ACCOUNT_STATUS_FILTERS, ACCOUNT_STATUS_LABEL, countAccountsByStatus } from '../src/lib/citadel/accounts'

const modules = import.meta.glob('../convex/**/*.ts')
const contact = {
  subject: 'contact',
  issuer: 'https://issuer.test',
  tokenIdentifier: 'https://issuer.test|contact',
  email: 'contact@example.com',
  emailVerified: true
}
const god = { subject: 'god', god: true, name: 'Operator' }
const createTest = () => convexTest(schema, modules)
let t: ReturnType<typeof createTest>
let send: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  vi.stubEnv('APP_BASE_URL', 'https://example.com')
  send = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'test-email' }), { status: 200 }))
  vi.stubGlobal('fetch', send)
  t = createTest()
})
afterEach(async () => {
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const create = (firebaseUid?: string) =>
  t.withIdentity(god).mutation(api.accounts.m.create, {
    name: 'Example Account',
    primaryContact: { name: 'Contact', email: contact.email, firebaseUid }
  })

describe('account provisioning admin confirmation', () => {
  test.each([false, true])('emails the contact and requires confirmation (linked=%s)', async (linked) => {
    if (linked) await t.withIdentity(contact).mutation(api.users.m.ensureCurrent, {})
    const accountId = await create(linked ? contact.subject : undefined)
    expect(await t.run((ctx) => ctx.db.get(accountId))).toMatchObject({ status: 'pending' })
    const invitations = await t.withIdentity(contact).query(api.accountMembers.q.listMyInvitations, {})
    expect(invitations).toHaveLength(1)
    expect(invitations[0]).toMatchObject({
      accountId,
      role: 'owner',
      status: 'invited',
      adminConfirmation: 'pending',
      joinedAt: null
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(send).toHaveBeenCalledTimes(1)
    const [url, options] = send.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    const email = JSON.parse(options.body)
    expect(email.to).toEqual([contact.email])
    expect(email.subject).toBe('Confirm admin access to Example Account on LiveSnapsNow')
    for (const body of [email.text, email.html]) {
      expect(body).toContain('https://example.com/account#invitations')
      expect(body).toContain('Confirm admin access')
      expect(body).not.toContain('Accept invitation')
    }
    await expect(t.withIdentity(contact).mutation(api.accountMembers.m.acceptInvite, { accountId })).rejects.toThrow()
    const confirmed = await t.withIdentity(contact).mutation(api.accountMembers.m.confirmAdminAccess, { accountId })
    expect(confirmed).toMatchObject({ adminConfirmation: 'confirmed', status: 'invited' })
    await expect(
      t.withIdentity(contact).mutation(api.accountMembers.m.completeAdminConfirmation, { accountId })
    ).rejects.toThrow()
    expect(await t.run((ctx) => ctx.db.get(accountId))).toMatchObject({ status: 'pending' })
    // A failed claim grant is retryable and remains visible in the account UI.
    expect(await t.withIdentity(contact).query(api.accountMembers.q.listMyInvitations, {})).toHaveLength(1)
    expect(
      await t.withIdentity(contact).mutation(api.accountMembers.m.confirmAdminAccess, { accountId })
    ).toMatchObject({ adminConfirmation: 'confirmed' })
    await t
      .withIdentity({ ...contact, admin: true })
      .mutation(api.accountMembers.m.completeAdminConfirmation, { accountId })
    expect(await t.withIdentity(contact).query(api.accountMembers.q.listMyInvitations, {})).toEqual([])
    expect(await t.withIdentity(contact).query(api.accountMembers.q.getMine, { accountId })).toMatchObject({
      status: 'active',
      adminConfirmation: 'complete'
    })
    expect(await t.run((ctx) => ctx.db.get(accountId))).toMatchObject({
      status: 'confirmed',
      ownerTokenIdentifier: contact.tokenIdentifier,
      primaryContact: { tokenIdentifier: contact.tokenIdentifier }
    })
    // Repeating a completed confirmation reports completion, even with an old token.
    expect(
      await t.withIdentity(contact).mutation(api.accountMembers.m.confirmAdminAccess, { accountId })
    ).toMatchObject({ adminConfirmation: 'complete' })
    const confirmedAccounts = await t.withIdentity(god).query(api.accounts.q.listForAdmin, { status: 'confirmed' })
    expect(confirmedAccounts.map((account) => account._id)).toEqual([accountId])
    expect(await t.withIdentity(god).query(api.accounts.q.listForAdmin, { status: 'pending' })).toEqual([])
    expect(countAccountsByStatus(confirmedAccounts)).toMatchObject({ all: 1, pending: 0, confirmed: 1 })
    expect(ACCOUNT_STATUS_FILTERS).toContain('confirmed')
    expect(ACCOUNT_STATUS_LABEL.confirmed).toBe('Confirmed')
    expect(canUseAccount('confirmed')).toBe(true)
    expect(canUseAccount('pending')).toBe(false)
  })

  test('refuses unsigned, unverified, wrong-email and wrong-linked-identity callers', async () => {
    await t.withIdentity(contact).mutation(api.users.m.ensureCurrent, {})
    const accountId = await create(contact.subject)
    const wrong = t.withIdentity({ subject: 'other', email: 'other@example.com', emailVerified: true })
    const otherAccount = await t.withIdentity(god).mutation(api.accounts.m.create, {
      name: 'Other Account',
      primaryContact: { name: 'Other', email: 'other@example.com' }
    })
    expect(
      (await t.withIdentity(contact).query(api.accountMembers.q.listMyInvitations, {})).map((i) => i.accountId)
    ).toEqual([accountId])
    expect((await wrong.query(api.accountMembers.q.listMyInvitations, {})).map((i) => i.accountId)).toEqual([
      otherAccount
    ])
    for (const caller of [
      t,
      wrong,
      t.withIdentity({ ...contact, emailVerified: false }),
      t.withIdentity({ ...contact, tokenIdentifier: 'different|contact' })
    ]) {
      await expect(caller.mutation(api.accountMembers.m.confirmAdminAccess, { accountId })).rejects.toThrow()
      await expect(caller.mutation(api.accountMembers.m.completeAdminConfirmation, { accountId })).rejects.toThrow()
    }
    await expect(
      t
        .withIdentity({ ...contact, admin: true })
        .mutation(api.accountMembers.m.completeAdminConfirmation, { accountId })
    ).rejects.toThrow()
  })

  test('ordinary invites do not authorize admin claims', async () => {
    const accountId = await create()
    const email = 'member@example.com'
    await t.withIdentity(god).mutation(api.accountMembers.m.invite, { accountId, email, role: 'owner' })
    const member = t.withIdentity({ subject: 'member', email, emailVerified: true })
    await expect(member.mutation(api.accountMembers.m.confirmAdminAccess, { accountId })).rejects.toThrow()
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const emailBodies = send.mock.calls.map((call) => JSON.parse(call[1].body))
    expect(emailBodies.find((e) => e.to[0] === email).subject).toContain("You're invited")
    expect(await member.mutation(api.accountMembers.m.acceptInvite, { accountId })).toMatchObject({ status: 'active' })
    await expect(member.mutation(api.accountMembers.m.confirmAdminAccess, { accountId })).rejects.toThrow()
  })

  test.each(['closed', 'suspended'] as const)('refuses confirmation for a %s account', async (status) => {
    const accountId = await create()
    await t.run((ctx) => ctx.db.patch(accountId, { status }))
    expect(await t.withIdentity(contact).query(api.accountMembers.q.listMyInvitations, {})).toEqual([])
    await expect(
      t.withIdentity(contact).mutation(api.accountMembers.m.confirmAdminAccess, { accountId })
    ).rejects.toThrow()
  })

  test('a suspended membership cannot confirm', async () => {
    const accountId = await create()
    const [member] = await t.withIdentity(contact).query(api.accountMembers.q.listMyInvitations, {})
    await t.run((ctx) => ctx.db.patch(member._id, { status: 'suspended' }))
    await expect(
      t.withIdentity(contact).mutation(api.accountMembers.m.confirmAdminAccess, { accountId })
    ).rejects.toThrow()
  })

  test('only a god can create an account and authorize a confirmation', async () => {
    for (const caller of [t, t.withIdentity(contact), t.withIdentity({ ...contact, admin: true })]) {
      await expect(
        caller.mutation(api.accounts.m.create, {
          name: 'Unauthorized',
          primaryContact: { name: 'Contact', email: contact.email }
        })
      ).rejects.toThrow()
    }
    expect(await t.run((ctx) => ctx.db.query('accounts').collect())).toEqual([])
    expect(send).not.toHaveBeenCalled()
  })

  test('a Resend failure is surfaced without losing the pending confirmation', async () => {
    const accountId = await create()
    const [member] = await t.withIdentity(contact).query(api.accountMembers.q.listMyInvitations, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    send.mockResolvedValueOnce(new Response('Domain not verified', { status: 403 }))
    await expect(t.action(internal.accountMembers.m.sendInviteEmail, { memberId: member._id })).rejects.toThrow(
      /Resend API failed/
    )
    expect(await t.run((ctx) => ctx.db.get(member._id))).toMatchObject({ accountId, adminConfirmation: 'pending' })
  })
})

describe('god contact admin controls', () => {
  test('cancels a pending invitation and suppresses its queued email', async () => {
    const accountId = await create()
    const { member } = await t.withIdentity(god).query(api.accountMembers.q.getContactAdminAccess, { accountId })
    if (!member) throw new Error('Missing contact fixture')
    const args = { accountId, memberId: member._id }
    for (const caller of [t, t.withIdentity(contact), t.withIdentity({ ...contact, admin: true })]) {
      await expect(caller.mutation(api.accountMembers.m.cancelAdminInvitation, args)).rejects.toThrow()
    }
    await t.withIdentity(god).mutation(api.accountMembers.m.cancelAdminInvitation, args)
    expect(await t.run((ctx) => ctx.db.get(member._id))).toMatchObject({
      status: 'suspended',
      adminConfirmation: 'cancelled'
    })
    expect(await t.withIdentity(contact).query(api.accountMembers.q.listMyInvitations, {})).toEqual([])
    await expect(
      t.withIdentity(contact).mutation(api.accountMembers.m.confirmAdminAccess, { accountId })
    ).rejects.toThrow()
    await expect(t.withIdentity(contact).mutation(api.accountMembers.m.acceptInvite, { accountId })).rejects.toThrow()
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(send).not.toHaveBeenCalled()
  })

  test('cancellation cannot race past confirmation consent; revocation blocks completion', async () => {
    const accountId = await create()
    const member = await t.withIdentity(contact).mutation(api.accountMembers.m.confirmAdminAccess, { accountId })
    const args = { accountId, memberId: member._id }
    await expect(t.withIdentity(god).mutation(api.accountMembers.m.cancelAdminInvitation, args)).rejects.toThrow(
      /already started/
    )
    await t.withIdentity(god).mutation(api.accountMembers.m.beginAdminRevocation, args)
    await expect(
      t
        .withIdentity({ ...contact, admin: true })
        .mutation(api.accountMembers.m.completeAdminConfirmation, { accountId })
    ).rejects.toThrow()
    expect(await t.run((ctx) => ctx.db.get(member._id))).toMatchObject({
      adminConfirmation: 'revoking',
      status: 'suspended'
    })
    expect(await t.run((ctx) => ctx.db.get(accountId))).toMatchObject({ status: 'suspended' })
    await t.withIdentity(god).mutation(api.accountMembers.m.completeAdminRevocation, args)
    await expect(
      t.withIdentity(contact).mutation(api.accountMembers.m.confirmAdminAccess, { accountId })
    ).rejects.toThrow()
  })

  test('requires god access and the current contact membership to revoke', async () => {
    const accountId = await create()
    const member = await t.withIdentity(contact).mutation(api.accountMembers.m.confirmAdminAccess, { accountId })
    await t
      .withIdentity({ ...contact, admin: true })
      .mutation(api.accountMembers.m.completeAdminConfirmation, { accountId })
    const args = { accountId, memberId: member._id }
    for (const caller of [
      t,
      t.withIdentity(contact),
      t.withIdentity({ ...contact, admin: true }),
      t.withIdentity({ ...contact, god: true })
    ]) {
      await expect(caller.mutation(api.accountMembers.m.beginAdminRevocation, args)).rejects.toThrow()
    }
    const otherMemberId = await t
      .withIdentity(god)
      .mutation(api.accountMembers.m.invite, { accountId, email: 'other@example.com', role: 'owner' })
    await expect(
      t.withIdentity(god).mutation(api.accountMembers.m.beginAdminRevocation, { accountId, memberId: otherMemberId })
    ).rejects.toThrow(/contact has changed/)
    await t.withIdentity(god).mutation(api.accountMembers.m.beginAdminRevocation, args)
    await t.withIdentity(god).mutation(api.accountMembers.m.completeAdminRevocation, args)
    expect(await t.run((ctx) => ctx.db.get(member._id))).toMatchObject({
      adminConfirmation: 'revoked',
      status: 'suspended'
    })
  })
})
