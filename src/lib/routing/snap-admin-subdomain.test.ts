import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  buildSnapAdminExitUrl,
  buildSnapAdminHandoffUrl,
  toSnapAdminExternalPath,
  toSnapAdminInternalPath,
  toSnapAdminSubdomainHostname
} from './snap-admin-subdomain'

describe('Snap Admin routing', () => {
  test('targets the root snaps subdomain from another application subdomain', () => {
    assert.equal(toSnapAdminSubdomainHostname('re-up.bigticket.ph'), 'snaps.bigticket.ph')
    assert.equal(toSnapAdminSubdomainHostname('aris.localhost'), 'snaps.localhost')
  })

  test('converts between canonical external and internal LiveSnaps paths', () => {
    assert.equal(toSnapAdminExternalPath('/l'), '/')
    assert.equal(toSnapAdminExternalPath('/l/snaps'), '/snaps')
    assert.equal(toSnapAdminInternalPath('/'), '/l')
    assert.equal(toSnapAdminInternalPath('/snaps'), '/l/snaps')
  })

  test('builds a cross-subdomain handoff URL with the canonical Snap Admin destination', () => {
    const handoffUrl = buildSnapAdminHandoffUrl(new URL('http://aris.localhost:3000/c'), 'firebase-token')
    const hash = new URLSearchParams(handoffUrl.hash.slice(1))

    assert.equal(handoffUrl.origin, 'http://snaps.localhost:3000')
    assert.equal(handoffUrl.pathname, '/snap-admin-handoff')
    assert.equal(hash.get('idToken'), 'firebase-token')
    assert.equal(hash.get('redirectTo'), '/')
  })

  test('uses the primary origin when snaps subdomains are unsupported', () => {
    const handoffUrl = buildSnapAdminHandoffUrl(
      new URL('https://re-up.bigticket-pro.vercel.app/'),
      'firebase-token'
    )
    const hash = new URLSearchParams(handoffUrl.hash.slice(1))

    assert.equal(handoffUrl.origin, 'https://bigticket-pro.vercel.app')
    assert.equal(handoffUrl.pathname, '/snap-admin-handoff')
    assert.equal(hash.get('redirectTo'), '/l')
  })

  test('exits Snap Admin through the primary LiveSnaps proof route', () => {
    const exitUrl = buildSnapAdminExitUrl(
      new URL('http://snaps.localhost:3000/snaps?proofs-search=ABC#selected')
    )

    assert.equal(exitUrl.toString(), 'http://localhost:3000/p')
  })

  test('keeps same-origin deployments on their current hostname when exiting', () => {
    const exitUrl = buildSnapAdminExitUrl(new URL('https://bigticket-pro.vercel.app/l/snaps'))

    assert.equal(exitUrl.toString(), 'https://bigticket-pro.vercel.app/p')
  })
})
