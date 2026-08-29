import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getProofRuntimeMode } from './debug'

describe('proof runtime mode', () => {
  test('local development bypasses GPS and disables mutations', () => {
    assert.deepEqual(getProofRuntimeMode('development'), {
      debug: true,
      gpsRequired: false,
      mutationsEnabled: false
    })
  })

  test('production and test environments retain live proof requirements', () => {
    for (const environment of ['production', 'test', '']) {
      assert.deepEqual(getProofRuntimeMode(environment), {
        debug: false,
        gpsRequired: true,
        mutationsEnabled: true
      })
    }
  })
})
