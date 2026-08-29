import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getSubdomainRoute } from './config'
import { extractSubdomain, getSubdomainFromHeaders } from './utils'

describe('subdomain routing', () => {
  test('maps the snaps subdomain to the Live Snaps route', () => {
    assert.equal(getSubdomainRoute('snaps'), '/l')
  })

  test('recognizes the production snaps hostname case-insensitively', () => {
    assert.deepEqual(extractSubdomain('Snaps.BigTicket.ph:443'), {
      subdomain: 'snaps',
      domain: 'bigticket.ph',
      isSubdomain: true
    })
  })

  test('uses the forwarded hostname when the application is behind a proxy', () => {
    const headers = new Headers({
      host: 'internal-service:3000',
      'x-forwarded-host': 'snaps.bigticket.ph'
    })

    assert.deepEqual(getSubdomainFromHeaders(headers), {
      subdomain: 'snaps',
      domain: 'bigticket.ph',
      isSubdomain: true
    })
  })
})
