import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { EMAIL_WORDMARK_URL, renderAccountInviteEmail } from './account-invite'

const base = {
  accountName: 'Northwind Logistics',
  inviteeEmail: 'james@example.com',
  role: 'owner',
  acceptUrl: 'https://livesnapsnow.com/account'
}

describe('renderAccountInviteEmail', () => {
  test('uses the official image wordmark in the HTML header', () => {
    const email = renderAccountInviteEmail(base)

    assert.ok(email.html.includes(`<img src="${EMAIL_WORDMARK_URL}"`))
    assert.ok(email.html.includes('alt="LiveSnapsNow"'))
    assert.ok(!email.html.includes('LIVE<span'))
  })

  test('greets by name when there is one', () => {
    const email = renderAccountInviteEmail({ ...base, inviteeName: 'James Carter' })

    assert.ok(email.text.includes('Hi James Carter,'))
    assert.ok(email.html.includes('Hi James Carter,'))
  })

  test('falls back to the address when the name is missing or blank', () => {
    for (const inviteeName of [null, undefined, '   ']) {
      const email = renderAccountInviteEmail({ ...base, inviteeName })
      assert.ok(email.text.includes('Hi james@example.com,'))
    }
  })

  test('names the inviter only when one is known', () => {
    assert.ok(renderAccountInviteEmail({ ...base, inviterName: 'Ava Reyes' }).text.includes('Ava Reyes invited you to join Northwind Logistics'))
    assert.ok(renderAccountInviteEmail(base).text.includes('You have been invited to join Northwind Logistics'))
  })

  test('escapes interpolated values so account names cannot inject markup', () => {
    const email = renderAccountInviteEmail({
      ...base,
      accountName: '<script>alert(1)</script> & Co',
      acceptUrl: 'https://livesnapsnow.com/account?a=1&b=2'
    })

    assert.ok(!email.html.includes('<script>'))
    assert.ok(email.html.includes('&lt;script&gt;'))
    assert.ok(email.html.includes('a=1&amp;b=2'))
  })

  test('carries the account, role, and destination in both alternatives', () => {
    const email = renderAccountInviteEmail(base)

    assert.equal(email.subject, "You're invited to Northwind Logistics on LiveSnapsNow")
    for (const body of [email.html, email.text]) {
      assert.ok(body.includes('Northwind Logistics'))
      assert.ok(body.includes('owner'))
      assert.ok(body.includes('https://livesnapsnow.com/account'))
    }
  })
})
