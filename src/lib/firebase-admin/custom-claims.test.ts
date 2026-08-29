import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  canManageFirebaseAccessClaim,
  canReceiveFirebaseClaimGrant,
  canViewTopgFirebaseUser,
  hasFirebaseSnapAdminAccess,
  isFirebaseCustomClaimName,
  isFirebaseManagedAccessClaimName,
  isPrivilegedFirebaseCustomClaimName,
  updateFirebaseAdminClaim,
  updateFirebaseManagedAccessClaim
} from './custom-claims'

describe('Firebase custom claim names', () => {
  test('accepts bounded application claim names', () => {
    assert.equal(isFirebaseCustomClaimName('role'), true)
    assert.equal(isFirebaseCustomClaimName('app.editor'), true)
    assert.equal(isFirebaseCustomClaimName('feature_flag-2'), true)
  })

  test('rejects reserved, unsafe, malformed, and untrimmed names', () => {
    assert.equal(isFirebaseCustomClaimName('sub'), false)
    assert.equal(isFirebaseCustomClaimName('constructor'), false)
    assert.equal(isFirebaseCustomClaimName('__proto__'), false)
    assert.equal(isFirebaseCustomClaimName('2fa'), false)
    assert.equal(isFirebaseCustomClaimName(' role'), false)
    assert.equal(isFirebaseCustomClaimName('role/name'), false)
  })

  test('keeps privileged claims out of the general claim editor', () => {
    assert.equal(isPrivilegedFirebaseCustomClaimName('admin'), true)
    assert.equal(isPrivilegedFirebaseCustomClaimName('snap-admin'), true)
    assert.equal(isPrivilegedFirebaseCustomClaimName('topg'), true)
    assert.equal(isPrivilegedFirebaseCustomClaimName('role'), false)
    assert.equal(isFirebaseCustomClaimName('admin'), false)
    assert.equal(isFirebaseCustomClaimName('snap-admin'), false)
    assert.equal(isFirebaseCustomClaimName('topg'), false)
    assert.equal(isFirebaseManagedAccessClaimName('admin'), true)
    assert.equal(isFirebaseManagedAccessClaimName('snap-admin'), true)
    assert.equal(isFirebaseManagedAccessClaimName('topg'), false)
  })
})

describe('Firebase admin claim updates', () => {
  test('grants admin without changing other claims', () => {
    assert.deepEqual(updateFirebaseAdminClaim({ role: 'staff', topg: true }, true), {
      admin: true,
      role: 'staff',
      topg: true
    })
  })

  test('revokes only admin and preserves every other claim', () => {
    assert.deepEqual(updateFirebaseAdminClaim({ admin: true, role: 'staff', topg: true }, false), {
      role: 'staff',
      topg: true
    })
  })

  test('manages snap-admin without changing other claims', () => {
    assert.deepEqual(updateFirebaseManagedAccessClaim({ admin: true, region: 'apac' }, 'snap-admin', true), {
      admin: true,
      region: 'apac',
      'snap-admin': true
    })
    assert.deepEqual(
      updateFirebaseManagedAccessClaim({ admin: true, region: 'apac', 'snap-admin': true }, 'snap-admin', false),
      { admin: true, region: 'apac' }
    )
  })
})

describe('Firebase privileged claim authorization', () => {
  test('allows admin or snap-admin into LiveSnaps', () => {
    assert.equal(hasFirebaseSnapAdminAccess({ admin: true }), true)
    assert.equal(hasFirebaseSnapAdminAccess({ 'snap-admin': true }), true)
    assert.equal(hasFirebaseSnapAdminAccess({ admin: false, 'snap-admin': false }), false)
    assert.equal(hasFirebaseSnapAdminAccess({ topg: true }), false)
  })

  test('only allows claim grants to users with a verified email', () => {
    assert.equal(canReceiveFirebaseClaimGrant({ email: 'verified@example.com', emailVerified: true }), true)
    assert.equal(canReceiveFirebaseClaimGrant({ email: 'unverified@example.com', emailVerified: false }), false)
    assert.equal(canReceiveFirebaseClaimGrant({ email: null, emailVerified: true }), false)
    assert.equal(canReceiveFirebaseClaimGrant({ email: '   ', emailVerified: true }), false)
  })

  test('requires a live admin claim to manage snap-admin', () => {
    assert.equal(canManageFirebaseAccessClaim({ admin: true }, 'snap-admin'), true)
    assert.equal(canManageFirebaseAccessClaim({ topg: true }, 'snap-admin'), false)
    assert.equal(canManageFirebaseAccessClaim({}, 'snap-admin'), false)
  })

  test('keeps admin claim management restricted to topg', () => {
    assert.equal(canManageFirebaseAccessClaim({ topg: true }, 'admin'), true)
    assert.equal(canManageFirebaseAccessClaim({ admin: true }, 'admin'), false)
  })

  test('only exposes topg targets to topg actors', () => {
    assert.equal(canViewTopgFirebaseUser({ admin: true }, { topg: true }), false)
    assert.equal(canViewTopgFirebaseUser({ admin: true, topg: true }, { topg: true }), true)
    assert.equal(canViewTopgFirebaseUser({ admin: true }, { 'snap-admin': true }), true)
  })
})
