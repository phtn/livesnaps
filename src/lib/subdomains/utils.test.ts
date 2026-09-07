import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getSubdomainRoute } from './config'
import { extractSubdomain, getSubdomainFromHeaders } from './utils'

describe('subdomain routing', () => {
  test('does not map the removed snaps subdomain', () => {
    assert.equal(getSubdomainRoute('snaps'), null)
  })

  test('keeps the reserved gods hostname out of generic subdomain routing', () => {
    assert.deepEqual(extractSubdomain('Gods.Livesnapsnow.com:443'), {
      subdomain: null,
      domain: 'livesnapsnow.com',
      isSubdomain: false
    })
  })

  test('uses the forwarded hostname when the application is behind a proxy', () => {
    const headers = new Headers({
      host: 'internal-service:3000',
      'x-forwarded-host': 'gods.livesnapsnow.com'
    })

    assert.deepEqual(getSubdomainFromHeaders(headers), {
      subdomain: null,
      domain: 'livesnapsnow.com',
      isSubdomain: false
    })
  })
})
