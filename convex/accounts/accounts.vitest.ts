/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import { api } from '../_generated/api'
import schema from '../schema'

const modules = import.meta.glob('/convex/**/*.ts')
const identity = (role: string) => ({ subject: role, tokenIdentifier: `issuer|${role}` })

async function fixture() {
  const t = convexTest(schema, modules)
  const accountId = await t.run((ctx) =>
    ctx.db.insert('accounts', {
      slug: 'workspace',
      name: 'Workspace',
      status: 'active',
      plan: 'trial',
      organization: {},
      primaryContact: {
        name: 'Original Owner',
        email: 'owner@example.com',
        phone: null,
        title: null,
        tokenIdentifier: 'issuer|owner'
      },
      billingEmail: null,
      ownerTokenIdentifier: 'issuer|owner',
      notes: null,
      closedAt: null,
      closedBy: null,
      closeReason: null,
      createdAt: 1,
      createdBy: 'issuer|god',
      updatedAt: 1,
      updatedBy: 'issuer|god'
    })
  )
  await t.run(async (ctx) => {
    for (const role of ['owner', 'admin', 'viewer'] as const) {
      await ctx.db.insert('accountMembers', {
        accountId,
        email: `${role}@example.com`,
        tokenIdentifier: `issuer|${role}`,
        userId: null,
        name: role,
        title: null,
        role,
        status: 'active',
        invitedAt: 1,
        invitedBy: 'test',
        joinedAt: 1,
        updatedAt: 1,
        updatedBy: 'test'
      })
    }
  })
  return { t, accountId }
}

describe('account profile management', () => {
  test('owners and admins edit account details without unlinking the contact identity', async () => {
    const { t, accountId } = await fixture()
    const updated = await t.withIdentity(identity('admin')).mutation(api.accounts.m.update, {
      id: accountId,
      name: 'Updated Workspace',
      primaryContact: { name: 'Updated Owner', email: 'new-owner@example.com' }
    })
    expect(updated.name).toBe('Updated Workspace')
    expect(updated.primaryContact).toMatchObject({
      name: 'Updated Owner',
      email: 'new-owner@example.com',
      tokenIdentifier: 'issuer|owner'
    })

    const logoKey = `accounts/${accountId}/logos/l0123456789abcdef0123456789abcdef.webp`
    expect(
      (
        await t.withIdentity(identity('owner')).mutation(api.accounts.m.setLogo, {
          id: accountId,
          objectKey: logoKey
        })
      ).logoR2Key
    ).toBe(logoKey)
  })

  test('viewers cannot edit details or set an account logo', async () => {
    const { t, accountId } = await fixture()
    const viewer = t.withIdentity(identity('viewer'))
    await expect(viewer.mutation(api.accounts.m.update, { id: accountId, name: 'Nope' })).rejects.toThrow(
      /Unauthorized/
    )
    await expect(
      viewer.mutation(api.accounts.m.setLogo, {
        id: accountId,
        objectKey: `accounts/${accountId}/logos/l0123456789abcdef0123456789abcdef.webp`
      })
    ).rejects.toThrow(/Unauthorized/)
  })
})
