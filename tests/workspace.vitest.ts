/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../convex/_generated/api'
import schema from '../convex/schema'

const modules = import.meta.glob('../convex/**/*.ts')
async function fixture() {
  const t = convexTest(schema, modules)
  const accountId = await t.withIdentity({ subject: 'god', god: true }).mutation(api.accounts.m.create, {
    name: 'Workspace', primaryContact: { name: 'Owner', email: 'owner@example.com' }
  })
  const ids = await t.run(async ctx => {
    const members = []
    for (const role of ['admin', 'owner', 'member', 'viewer'] as const) {
      members.push(await ctx.db.insert('accountMembers', {
        accountId, email: `${role}@example.com`, tokenIdentifier: `issuer|${role}`, userId: null,
        name: role, title: null, role, status: 'active', invitedAt: 1, invitedBy: 'test',
        joinedAt: 1, updatedAt: 1, updatedBy: 'test'
      }))
    }
    const snapId = await ctx.db.insert('snaps', {
      metadata: { photos: [], storage_prefix: 'snaps/', upload_id: 'snap-1' }, updated_at: 1,
      verification_status: 'draft'
    })
    for (const sender of ['member', 'other']) {
      await ctx.db.insert('verificationEntries', {
        applicant: 'Applicant', createdAt: sender === 'other' ? 2 : 1, emailFromAddress: `${sender}@example.com`,
        emailToAddress: 'recipient@example.com', plateNumber: 'ABC123', senderName: sender,
        senderTokenIdentifier: `issuer|${sender}`, senderUid: sender, status: 'draft', updatedAt: 1, uploadId: 'snap-1'
      })
    }
    return { members, snapId }
  })
  const as = (role: string) => t.withIdentity({ subject: role, tokenIdentifier: `issuer|${role}`, admin: true })
  return { t, as, ...ids }
}

test('admin and owner see every entry; member sees only their own even with the admin claim', async () => {
  const { as, t } = await fixture()
  for (const role of ['admin', 'owner']) expect(await as(role).query(api.verificationEntries.q.listAllForAdmin, {})).toHaveLength(2)
  const entries = await as('member').query(api.verificationEntries.q.listAllForAdmin, { limit: 1 })
  expect(entries.map(entry => entry.senderUid)).toEqual(['member'])
  expect(await as('viewer').query(api.verificationEntries.q.listAllForAdmin, {})).toEqual([])
  await expect(t.query(api.verificationEntries.q.listAllForAdmin, {})).rejects.toThrow('Unauthorized')
})

test('admins assign and clear the canonical handler without changing sender or verification status', async () => {
  const { t, as, members, snapId } = await fixture()
  await as('admin').mutation(api.snaps.handlers.setHandler, { uploadId: 'snap-1', memberId: members[2] })
  const entries = await as('admin').query(api.verificationEntries.q.listAllForAdmin, {})
  expect(entries.every(entry => entry.handler?.email === 'member@example.com')).toBe(true)
  expect(entries.map(entry => entry.senderUid)).toEqual(['other', 'member'])
  await as('owner').mutation(api.snaps.handlers.setHandler, { uploadId: 'snap-1', memberId: null })
  const snap = await t.run(ctx => ctx.db.get(snapId))
  expect(snap?.handler).toBeUndefined()
  expect(snap?.verification_status).toBe('draft')
})

test('members cannot manage handlers; suspended or viewer targets cannot be assigned', async () => {
  const { t, as, members } = await fixture()
  expect(await as('member').query(api.snaps.handlers.options, {})).toEqual({ canManage: false, members: [] })
  for (const memberId of [null, members[2]]) {
    await expect(as('member').mutation(api.snaps.handlers.setHandler, { uploadId: 'snap-1', memberId })).rejects.toThrow('administrator')
  }
  await expect(as('admin').mutation(api.snaps.handlers.setHandler, { uploadId: 'snap-1', memberId: members[3] })).rejects.toThrow('active member')
  await t.run(ctx => ctx.db.patch(members[2], { status: 'suspended' }))
  await expect(as('admin').mutation(api.snaps.handlers.setHandler, { uploadId: 'snap-1', memberId: members[2] })).rejects.toThrow('active member')
})


test('rejects cross-account assignments and rechecks administrator membership on every write', async () => {
  const { t, as, members } = await fixture()
  const otherAccount = await t.withIdentity({ subject: 'god', god: true }).mutation(api.accounts.m.create, {
    name: 'Other account', primaryContact: { name: 'Other', email: 'other@example.com' }
  })
  await t.run(ctx => ctx.db.patch(members[2], { accountId: otherAccount }))
  await expect(as('admin').mutation(api.snaps.handlers.setHandler, { uploadId: 'snap-1', memberId: members[2] })).rejects.toThrow('active member')
  await t.run(ctx => ctx.db.patch(members[0], { role: 'member' }))
  await expect(as('admin').mutation(api.snaps.handlers.setHandler, { uploadId: 'snap-1', memberId: null })).rejects.toThrow('administrator')
})
