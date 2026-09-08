import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { EMAIL_WORDMARK_URL } from './account-invite'
import { renderSubmissionLinkShareEmail } from './submission-link-share'

const input = {
  accountName: 'Northwind Logistics',
  linkLabel: 'Damage intake',
  message: 'Please upload the requested photos.\nThank you.',
  submissionUrl: 'https://livesnapsnow.com/northwind/damage'
}

describe('renderSubmissionLinkShareEmail', () => {
  test('uses the official wordmark and carries the message and link in both bodies', () => {
    const email = renderSubmissionLinkShareEmail(input)
    assert.ok(email.html.includes(`<img src="${EMAIL_WORDMARK_URL}"`))
    assert.ok(email.html.includes('Please upload the requested photos.<br />Thank you.'))
    assert.ok(email.text.includes(input.message))
    assert.ok(email.html.includes(input.submissionUrl))
    assert.ok(email.text.includes(input.submissionUrl))
  })

  test('escapes operator-controlled content', () => {
    const email = renderSubmissionLinkShareEmail({ ...input, accountName: '<script>x</script>', message: 'A & B' })
    assert.ok(!email.html.includes('<script>'))
    assert.ok(email.html.includes('&lt;script&gt;'))
    assert.ok(email.html.includes('A &amp; B'))
  })
})
