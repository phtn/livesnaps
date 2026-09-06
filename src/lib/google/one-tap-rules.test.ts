import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { canPromptGoogleOneTap, type OneTapPromptConditions } from './one-tap-rules'

const allowed: OneTapPromptConditions = {
  hostname: 'livesnapsnow.com',
  isSignedOut: true,
  isAuthLoading: false,
  hasClientId: true,
  isConfigured: true,
  isSuppressed: false,
  hasPrompted: false
}

describe('google one tap prompt rules', () => {
  test('prompts a signed-out visitor on the main app', () => {
    assert.equal(canPromptGoogleOneTap(allowed), true)
    assert.equal(canPromptGoogleOneTap({ ...allowed, hostname: 'localhost' }), true)
  })

  test('never prompts on an admin or Citadel origin', () => {
    for (const hostname of ['admin.livesnapsnow.com', 'gods.livesnapsnow.com', 'admin.localhost', 'gods.localhost']) {
      assert.equal(canPromptGoogleOneTap({ ...allowed, hostname }), false, hostname)
    }
  })

  test('waits for auth to resolve, and leaves a signed-in visitor alone', () => {
    assert.equal(canPromptGoogleOneTap({ ...allowed, isAuthLoading: true }), false)
    assert.equal(canPromptGoogleOneTap({ ...allowed, isSignedOut: false }), false)
  })

  test('stays quiet when Google or Firebase is not configured', () => {
    assert.equal(canPromptGoogleOneTap({ ...allowed, hasClientId: false }), false)
    assert.equal(canPromptGoogleOneTap({ ...allowed, isConfigured: false }), false)
  })

  test('honors the sign-out suppression and the once-per-session guard', () => {
    assert.equal(canPromptGoogleOneTap({ ...allowed, isSuppressed: true }), false)
    assert.equal(canPromptGoogleOneTap({ ...allowed, hasPrompted: true }), false)
  })
})
