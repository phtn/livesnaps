import { beforeEach, expect, test, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import type { UserRecord } from 'firebase-admin/auth'
import type { Doc } from '../convex/_generated/dataModel'
import { createContactAdminAccessService } from '../src/server/gods-account-admin-access'

const query = vi.fn()
const mutation = vi.fn()
const deps = { getByUid: vi.fn(), getByEmail: vi.fn(), revoke: vi.fn() }
const service = createContactAdminAccessService(deps)
type Client = Parameters<typeof service.read>[0]
const client = { query, mutation } as unknown as Client
const account = { _id: 'account', primaryContact: { email: 'contact@example.com' } } as Doc<'accounts'>
const actor = { uid: 'god-uid', claims: { god: true } }
const target = { uid: 'contact-uid', customClaims: { admin: true, unrelated: 'preserve' } } as unknown as UserRecord

beforeEach(() => {
  vi.resetAllMocks()
  query.mockResolvedValue({
    member: { _id: 'member', status: 'active', adminConfirmation: 'complete' },
    firebaseUid: 'contact-uid'
  })
  deps.getByUid.mockResolvedValue(target)
  deps.getByEmail.mockResolvedValue(target)
})

test('a god can revoke the resolved contact and the mutations bracket Firebase removal', async () => {
  expect(await service.read(client, account, actor)).toMatchObject({
    status: 'granted',
    canRevoke: true,
    claimGranted: true
  })
  await service.change(client, account, actor, 'revoke-admin', 'member')
  expect(deps.getByUid).toHaveBeenCalledWith('contact-uid')
  expect(deps.revoke).toHaveBeenCalledExactlyOnceWith('contact-uid')
  expect(mutation.mock.calls.map(([ref]) => getFunctionName(ref))).toEqual([
    'accountMembers/m:beginAdminRevocation',
    'accountMembers/m:completeAdminRevocation'
  ])
  expect(mutation.mock.invocationCallOrder[0]).toBeLessThan(deps.revoke.mock.invocationCallOrder[0])
  expect(deps.revoke.mock.invocationCallOrder[0]).toBeLessThan(mutation.mock.invocationCallOrder[1])
})

test('failed Firebase revocation never marks completion and remains retryable even if the claim was already removed', async () => {
  deps.revoke.mockRejectedValueOnce(new Error('Firebase unavailable'))
  await expect(service.change(client, account, actor, 'revoke-admin', 'member')).rejects.toThrow(/incomplete/)
  expect(mutation).toHaveBeenCalledTimes(1)
  query.mockResolvedValue({
    member: { _id: 'member', status: 'suspended', adminConfirmation: 'revoking' },
    firebaseUid: 'contact-uid'
  })
  deps.getByUid.mockResolvedValue({ ...target, customClaims: {} })
  expect(await service.read(client, account, actor)).toMatchObject({
    status: 'revoking',
    canRevoke: true,
    claimGranted: false
  })
  await service.change(client, account, actor, 'revoke-admin', 'member')
  expect(mutation).toHaveBeenCalledTimes(3)
})

test('cancelling an unregistered contact never changes Firebase claims', async () => {
  query.mockResolvedValue({
    member: { _id: 'member', status: 'invited', adminConfirmation: 'pending' },
    firebaseUid: null
  })
  deps.getByEmail.mockRejectedValue({ code: 'auth/user-not-found' })
  expect(await service.read(client, account, actor)).toMatchObject({
    status: 'pending',
    canCancel: true,
    canRevoke: false
  })
  await service.change(client, account, actor, 'cancel-admin-invite', 'member')
  expect(getFunctionName(mutation.mock.calls[0][0])).toBe('accountMembers/m:cancelAdminInvitation')
  expect(deps.revoke).not.toHaveBeenCalled()
})

test('ordinary admins cannot inspect or change contact admin access', async () => {
  await expect(
    service.change(client, account, { uid: 'admin', claims: { admin: true } }, 'revoke-admin', 'member')
  ).rejects.toThrow(/God access/)
  expect(query).not.toHaveBeenCalled()
  expect(deps.revoke).not.toHaveBeenCalled()
})

test.each(['self', 'topg', 'stale-member'])('refuses %s revocation', async (kind) => {
  if (kind === 'self') deps.getByUid.mockResolvedValue({ ...target, uid: actor.uid })
  if (kind === 'topg') deps.getByUid.mockResolvedValue({ ...target, customClaims: { admin: true, topg: true } })
  await expect(
    service.change(client, account, actor, 'revoke-admin', kind === 'stale-member' ? 'other' : 'member')
  ).rejects.toThrow()
  expect(mutation).not.toHaveBeenCalled()
  expect(deps.revoke).not.toHaveBeenCalled()
})
