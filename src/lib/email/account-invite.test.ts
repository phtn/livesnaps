import { describe, expect, it } from 'vitest'
import { renderAccountInviteEmail } from './account-invite'

const base = {
  accountName: 'Northwind Logistics',
  inviteeEmail: 'james@example.com',
  role: 'owner',
  acceptUrl: 'https://livesnapsnow.com/account'
}

describe('renderAccountInviteEmail', () => {
  it('greets by name when there is one', () => {
    const email = renderAccountInviteEmail({ ...base, inviteeName: 'James Carter' })

    expect(email.text).toContain('Hi James Carter,')
    expect(email.html).toContain('Hi James Carter,')
  })

  it('falls back to the address when the name is missing or blank', () => {
    for (const inviteeName of [null, undefined, '   ']) {
      const email = renderAccountInviteEmail({ ...base, inviteeName })
      expect(email.text).toContain('Hi james@example.com,')
    }
  })

  it('names the inviter only when one is known', () => {
    expect(renderAccountInviteEmail({ ...base, inviterName: 'Ava Reyes' }).text).toContain(
      'Ava Reyes invited you to join Northwind Logistics'
    )
    expect(renderAccountInviteEmail(base).text).toContain('You have been invited to join Northwind Logistics')
  })

  it('escapes interpolated values so account names cannot inject markup', () => {
    const email = renderAccountInviteEmail({
      ...base,
      accountName: '<script>alert(1)</script> & Co',
      acceptUrl: 'https://livesnapsnow.com/account?a=1&b=2'
    })

    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
    expect(email.html).toContain('a=1&amp;b=2')
  })

  it('carries the account, role, and destination in both alternatives', () => {
    const email = renderAccountInviteEmail(base)

    expect(email.subject).toBe("You're invited to Northwind Logistics on LiveSnapsNow")
    for (const body of [email.html, email.text]) {
      expect(body).toContain('Northwind Logistics')
      expect(body).toContain('owner')
      expect(body).toContain('https://livesnapsnow.com/account')
    }
  })
})
