/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import schema from '../convex/schema'
import type { AccountMemberRole } from '../src/lib/accounts/members'

const modules = import.meta.glob('../convex/**/*.ts')

async function fixture() {
  const t = convexTest(schema, modules)
  const as = (person: string) =>
    t.withIdentity({ subject: person, tokenIdentifier: `issuer|${person}`, email: `${person}@example.com`, name: person })
  const ids = await t.run(async (ctx) => {
    async function account(slug: string) {
      return await ctx.db.insert('accounts', {
        slug, name: slug, status: 'active', plan: 'trial', organization: {},
        primaryContact: { name: 'Owner', email: `${slug}@example.com`, phone: null, title: null, tokenIdentifier: null },
        billingEmail: null, ownerTokenIdentifier: 'test', notes: null, closedAt: null, closedBy: null, closeReason: null,
        createdAt: 1, createdBy: 'god', updatedAt: 1, updatedBy: 'god'
      })
    }
    const accountA = await account('org-a')
    const accountB = await account('org-b')
    async function member(accountId: Id<'accounts'>, person: string, role: AccountMemberRole) {
      return await ctx.db.insert('accountMembers', {
        accountId, email: `${person}@example.com`, tokenIdentifier: `issuer|${person}`, userId: null,
        name: person, title: null, role, status: 'active', invitedAt: 1, invitedBy: 'test',
        joinedAt: 1, updatedAt: 1, updatedBy: 'test'
      })
    }
    return {
      accountA,
      accountB,
      owner: await member(accountA, 'owner', 'owner'),
      owner2: await member(accountA, 'owner-2', 'owner'),
      admin: await member(accountA, 'admin', 'admin'),
      admin2: await member(accountA, 'admin-2', 'admin'),
      staff: await member(accountA, 'staff', 'member'),
      viewer: await member(accountA, 'viewer', 'viewer'),
      outsider: await member(accountB, 'outsider', 'owner')
    }
  })
  return { t, as, ...ids }
}

test('members and viewers get the limited details; admins and owners get what they may change', async () => {
  const { as, accountA, staff, admin2 } = await fixture()

  for (const person of ['staff', 'viewer']) {
    const detail = await as(person).query(api.accountMembers.q.getDetail, { accountId: accountA, memberId: admin2 })
    expect(detail.access).toBe('limited')
    expect(Object.keys(detail.member).sort()).toEqual(['_id', 'avatar', 'email', 'joinedAt', 'name', 'role', 'status', 'title'])
    expect(detail).not.toHaveProperty('permissions')
  }

  const asAdmin = await as('admin').query(api.accountMembers.q.getDetail, { accountId: accountA, memberId: staff })
  expect(asAdmin).toMatchObject({
    access: 'manage',
    permissions: { canEditTitle: true, canChangeStatus: true, assignableRoles: ['viewer', 'member', 'admin'] }
  })

  const adminOnPeer = await as('admin').query(api.accountMembers.q.getDetail, { accountId: accountA, memberId: admin2 })
  expect(adminOnPeer).toMatchObject({ access: 'manage', permissions: { canEditTitle: false, canChangeStatus: false, assignableRoles: [] } })

  const ownerOnAdmin = await as('owner').query(api.accountMembers.q.getDetail, { accountId: accountA, memberId: admin2 })
  expect(ownerOnAdmin).toMatchObject({ permissions: { assignableRoles: ['viewer', 'member', 'admin', 'owner'] } })
})

test('details never cross accounts', async () => {
  const { as, accountA, accountB, staff, outsider } = await fixture()
  await expect(as('outsider').query(api.accountMembers.q.getDetail, { accountId: accountA, memberId: staff })).rejects.toThrow('Unauthorized')
  // A member id from another account is not readable through your own.
  await expect(as('owner').query(api.accountMembers.q.getDetail, { accountId: accountA, memberId: outsider })).rejects.toThrow('Member not found')
  await expect(as('owner').query(api.accountMembers.q.getDetail, { accountId: accountB, memberId: outsider })).rejects.toThrow('Unauthorized')
})

test('admins manage members and viewers but not admins or owners', async () => {
  const { as, staff, owner, admin2 } = await fixture()
  const admin = as('admin')

  expect(await admin.mutation(api.accountMembers.m.setTitle, { memberId: staff, title: '  Field lead ' })).toMatchObject({ title: 'Field lead' })
  expect(await admin.mutation(api.accountMembers.m.setRole, { memberId: staff, role: 'viewer' })).toMatchObject({ role: 'viewer' })
  expect(await admin.mutation(api.accountMembers.m.setStatus, { memberId: staff, status: 'suspended' })).toMatchObject({ status: 'suspended' })

  await expect(admin.mutation(api.accountMembers.m.setRole, { memberId: staff, role: 'owner' })).rejects.toThrow('Only an account owner can grant the owner role')
  // Previously allowed: an admin demoting an owner while another owner remained.
  await expect(admin.mutation(api.accountMembers.m.setRole, { memberId: owner, role: 'member' })).rejects.toThrow('Only an account owner')
  await expect(admin.mutation(api.accountMembers.m.setStatus, { memberId: owner, status: 'suspended' })).rejects.toThrow('Only an account owner')
  await expect(admin.mutation(api.accountMembers.m.setTitle, { memberId: admin2, title: 'x' })).rejects.toThrow('Only an account owner')

  for (const person of ['staff', 'viewer']) {
    await expect(as(person).mutation(api.accountMembers.m.setTitle, { memberId: admin2, title: 'x' })).rejects.toThrow('Unauthorized')
  }
})

test('owners manage everyone, but the last owner stays and nobody suspends themselves', async () => {
  const { as, accountA, admin, admin2, owner, owner2 } = await fixture()
  const ownerActor = as('owner')

  expect(await ownerActor.mutation(api.accountMembers.m.setRole, { memberId: admin, role: 'owner' })).toMatchObject({ role: 'owner' })
  expect(await ownerActor.mutation(api.accountMembers.m.setTitle, { memberId: admin2, title: null })).toMatchObject({ title: null })
  expect(await ownerActor.mutation(api.accountMembers.m.setRole, { memberId: owner2, role: 'member' })).toMatchObject({ role: 'member' })
  expect(await ownerActor.mutation(api.accountMembers.m.setRole, { memberId: admin, role: 'admin' })).toMatchObject({ role: 'admin' })

  const detail = await ownerActor.query(api.accountMembers.q.getDetail, { accountId: accountA, memberId: owner })
  expect(detail).toMatchObject({ permissions: { isSelf: true, isLastOwner: true, canChangeStatus: false } })
  await expect(ownerActor.mutation(api.accountMembers.m.setRole, { memberId: owner, role: 'admin' })).rejects.toThrow('at least one owner')
  await expect(ownerActor.mutation(api.accountMembers.m.setStatus, { memberId: owner, status: 'suspended' })).rejects.toThrow('cannot suspend your own')
})
