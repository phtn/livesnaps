import { describe, expect, test } from 'vitest'
import { buildAccountLogoObjectKey, isAccountLogoObjectKey } from '../src/lib/r2/account-logos'

describe('account logo object keys', () => {
  const accountId = 'j57abc_def-123'
  const logoId = '0123456789abcdef0123456789abcdef'

  test('uses the account-scoped logos folder and WebP filename', () => {
    const key = buildAccountLogoObjectKey(accountId, logoId)
    expect(key).toBe(`accounts/${accountId}/logos/l${logoId}.webp`)
    expect(isAccountLogoObjectKey(accountId, key)).toBe(true)
  })

  test('rejects traversal, other accounts, and non-WebP files', () => {
    expect(isAccountLogoObjectKey(accountId, `accounts/other/logos/l${logoId}.webp`)).toBe(false)
    expect(isAccountLogoObjectKey(accountId, `accounts/${accountId}/logos/../l${logoId}.webp`)).toBe(false)
    expect(isAccountLogoObjectKey(accountId, `accounts/${accountId}/logos/l${logoId}.png`)).toBe(false)
    expect(() => buildAccountLogoObjectKey('../account', logoId)).toThrow(/Invalid account logo path/)
  })
})
