import { beforeEach, describe, expect, test, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import { createAccountConfirmationHandler } from '../src/server/account-confirmation-routes'

type Dependencies = NonNullable<Parameters<typeof createAccountConfirmationHandler>[0]>
const mutation = vi.fn()
const deps: Dependencies = {
  verifyIdentity: vi.fn(),
  createClient: vi.fn(() => ({ mutation }) as unknown as ReturnType<Dependencies['createClient']>),
  grantAdmin: vi.fn(),
  revokeAdmin: vi.fn(),
  mintToken: vi.fn()
}
const request = (init: RequestInit = {}) =>
  new Request('https://example.com/api/account/confirm-admin', {
    method: 'POST',
    headers: {
      authorization: 'Bearer contact-token',
      'content-type': 'application/json',
      origin: 'https://example.com'
    },
    body: JSON.stringify({ accountId: 'account-id', uid: 'ignored-attacker-input' }),
    ...init
  })
const handler = createAccountConfirmationHandler(deps)

beforeEach(() => {
  vi.clearAllMocks()
  mutation.mockReset().mockResolvedValueOnce({ adminConfirmation: 'confirmed' }).mockResolvedValue(null)
  vi.mocked(deps.verifyIdentity).mockResolvedValue({ uid: 'verified-contact', email: 'contact@example.com' })
  vi.mocked(deps.grantAdmin).mockReset().mockResolvedValue(false)
  vi.mocked(deps.mintToken).mockResolvedValue('fresh-admin-token')
})

describe('admin confirmation HTTP boundary', () => {
  test('confirms consent, grants the verified caller, then completes with fresh claims', async () => {
    expect((await handler(request(), { convexUrl: 'https://deployment.convex.cloud' })).status).toBe(200)
    expect(deps.verifyIdentity).toHaveBeenCalledWith('contact-token')
    expect(deps.grantAdmin).toHaveBeenCalledExactlyOnceWith('verified-contact', 'contact@example.com')
    expect(deps.mintToken).toHaveBeenCalledWith('verified-contact')
    expect(deps.createClient).toHaveBeenNthCalledWith(2, 'fresh-admin-token', 'https://deployment.convex.cloud')
    expect(mutation.mock.calls.map(([ref]) => getFunctionName(ref))).toEqual([
      'accountMembers/m:confirmAdminAccess',
      'accountMembers/m:completeAdminConfirmation'
    ])
    expect(mutation.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(deps.grantAdmin).mock.invocationCallOrder[0])
    expect(vi.mocked(deps.grantAdmin).mock.invocationCallOrder[0]).toBeLessThan(mutation.mock.invocationCallOrder[1])
  })

  test('a failed Firebase write remains retryable and does not complete membership', async () => {
    vi.mocked(deps.grantAdmin).mockRejectedValueOnce(new Error('Firebase unavailable'))
    expect((await handler(request())).status).toBe(500)
    expect(mutation).toHaveBeenCalledTimes(1)
    expect(deps.mintToken).not.toHaveBeenCalled()
    mutation.mockResolvedValueOnce({ adminConfirmation: 'confirmed' }).mockResolvedValue(null)
    expect((await handler(request())).status).toBe(200)
  })

  test('a rejected confirmation never grants a claim', async () => {
    mutation
      .mockReset()
      .mockRejectedValueOnce(new Error('Uncaught ConvexError: No admin confirmation is available for this contact.'))
    expect((await handler(request())).status).toBe(403)
    expect(deps.grantAdmin).not.toHaveBeenCalled()
  })

  test('replaying completed confirmation cannot regrant revoked admin access', async () => {
    mutation.mockReset().mockResolvedValue({ adminConfirmation: 'complete' })
    expect((await handler(request())).status).toBe(200)
    expect(deps.grantAdmin).not.toHaveBeenCalled()
    expect(deps.mintToken).not.toHaveBeenCalled()
  })

  test.each([
    [{ method: 'GET', body: undefined }, 405],
    [{ headers: {} }, 401],
    [{ headers: { origin: 'https://attacker.example', authorization: 'Bearer contact-token' } }, 403],
    [{ body: 'bad json' }, 400],
    [{ body: '{}' }, 400]
  ] as const)('rejects invalid HTTP requests before accessing Firebase', async (init, status) => {
    expect((await handler(request(init))).status).toBe(status)
    expect(deps.verifyIdentity).not.toHaveBeenCalled()
    expect(deps.grantAdmin).not.toHaveBeenCalled()
  })
})

test('an in-flight grant is removed when a god revokes before confirmation completes', async () => {
  const query = vi.fn().mockResolvedValue({ adminConfirmation: 'revoked' })
  vi.mocked(deps.createClient).mockReturnValue({ mutation, query } as unknown as ReturnType<
    Dependencies['createClient']
  >)
  vi.mocked(deps.grantAdmin).mockResolvedValue(true)
  mutation
    .mockReset()
    .mockResolvedValueOnce({ adminConfirmation: 'confirmed' })
    .mockRejectedValueOnce(new Error('Uncaught ConvexError: No admin confirmation is available for this contact.'))
  expect((await handler(request())).status).toBe(403)
  expect(deps.revokeAdmin).toHaveBeenCalledExactlyOnceWith('verified-contact')
})
