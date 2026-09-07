import { describe, expect, test } from 'vitest'
import { convexTest } from 'convex-test'
import { api } from '../convex/_generated/api'
import schema from '../convex/schema'
import { normalizeAccountWebsiteUrl } from '../src/lib/accounts/accounts'

const modules = import.meta.glob('../convex/**/*.ts')
const god = { subject: 'god', god: true }

describe('account website normalization', () => {
  test.each([
    ['northwind.com', 'https://northwind.com/'],
    ['www.northwind.com/about', 'https://www.northwind.com/about'],
    ['https://northwind.com/contact?from=citadel', 'https://northwind.com/contact?from=citadel'],
    ['http://localhost:3000/account', 'http://localhost:3000/account']
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeAccountWebsiteUrl(input)).toBe(expected)
  })

  test.each(['not a website', 'https://', 'ftp://northwind.com', 'javascript:alert(1)'])('rejects %s', (input) => {
    expect(normalizeAccountWebsiteUrl(input)).toBeNull()
  })

  test('the server stores a normalized URL even when an API caller sends a bare domain', async () => {
    const t = convexTest(schema, modules)
    const accountId = await t.withIdentity(god).mutation(api.accounts.m.create, {
      name: 'Northwind',
      organization: { website: 'northwind.com/docs' },
      primaryContact: { name: 'Ada Reyes', email: 'ada@northwind.com' }
    })

    expect(await t.run((ctx) => ctx.db.get(accountId))).toMatchObject({
      organization: { website: 'https://northwind.com/docs' }
    })
  })

  test('the server rejects unsupported or malformed website values', async () => {
    for (const website of ['ftp://northwind.com', 'not a website']) {
      const t = convexTest(schema, modules)
      await expect(
        t.withIdentity(god).mutation(api.accounts.m.create, {
          name: 'Northwind',
          organization: { website },
          primaryContact: { name: 'Ada Reyes', email: 'ada@northwind.com' }
        })
      ).rejects.toThrow(/valid HTTP or HTTPS/)
    }
  })
})
