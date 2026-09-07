import { beforeEach, expect, test, vi } from 'vitest'
import {
  getFirebaseUserByUid,
  revokeFirebaseUserRefreshTokens,
  setFirebaseCustomUserClaims
} from '../src/lib/firebase-admin/admin'
import { clearAdminIdTokenCache } from '../src/lib/firebase-admin/admin-id-token'
import { revokeAccountAdminClaim } from '../src/lib/firebase-admin/account-admin-access'

vi.mock('../src/lib/firebase-admin/admin', () => ({
  getFirebaseUserByUid: vi.fn(),
  setFirebaseCustomUserClaims: vi.fn(),
  revokeFirebaseUserRefreshTokens: vi.fn()
}))
vi.mock('../src/lib/firebase-admin/admin-id-token', () => ({ clearAdminIdTokenCache: vi.fn() }))

beforeEach(() => vi.resetAllMocks())

test('removes only admin, clears cached ID tokens and revokes refresh tokens', async () => {
  vi.mocked(getFirebaseUserByUid).mockResolvedValue({
    customClaims: { admin: true, god: true, custom: 'preserved' }
  } as unknown as Awaited<ReturnType<typeof getFirebaseUserByUid>>)
  await revokeAccountAdminClaim('contact-uid')
  expect(setFirebaseCustomUserClaims).toHaveBeenCalledExactlyOnceWith('contact-uid', { god: true, custom: 'preserved' })
  expect(clearAdminIdTokenCache).toHaveBeenCalledExactlyOnceWith('contact-uid')
  expect(revokeFirebaseUserRefreshTokens).toHaveBeenCalledExactlyOnceWith('contact-uid')
})

test('retries session revocation when the claim has already been removed', async () => {
  vi.mocked(getFirebaseUserByUid).mockResolvedValue({ customClaims: { custom: 'preserved' } } as unknown as Awaited<
    ReturnType<typeof getFirebaseUserByUid>
  >)
  await revokeAccountAdminClaim('contact-uid')
  expect(setFirebaseCustomUserClaims).not.toHaveBeenCalled()
  expect(revokeFirebaseUserRefreshTokens).toHaveBeenCalledExactlyOnceWith('contact-uid')
})
