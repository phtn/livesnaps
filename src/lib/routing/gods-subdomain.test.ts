import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { buildGodsHandoffUrl, isGodsSubdomainHostname } from './gods-subdomain'

describe('Gods routing', () => {
  test('targets the gods subdomain and keeps the ID token in the fragment', () => {
    const handoffUrl = buildGodsHandoffUrl(new URL('https://livesnapsnow.com/citadel'), 'firebase-token')
    const hash = new URLSearchParams(handoffUrl.hash.slice(1))

    assert.equal(handoffUrl.origin, 'https://gods.livesnapsnow.com')
    assert.equal(handoffUrl.pathname, '/citadel')
    assert.equal(hash.get('idToken'), 'firebase-token')
  })

  test('recognizes only the gods subdomain', () => {
    assert.equal(isGodsSubdomainHostname('gods.livesnapsnow.com'), true)
    assert.equal(isGodsSubdomainHostname('admin.livesnapsnow.com'), false)
  })
})
