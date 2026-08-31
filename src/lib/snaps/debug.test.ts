import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getSnapRuntimeMode, isLocalDevelopmentHostname } from './debug'

describe('proof runtime mode', () => {
  test('local development bypasses GPS and disables mutations', () => {
    assert.deepEqual(getSnapRuntimeMode('development'), {
      debug: true,
      gpsRequired: false,
      mutationsEnabled: false
    })
  })

  test('production and test environments retain live proof requirements', () => {
    for (const environment of ['production', 'test', '']) {
      assert.deepEqual(getSnapRuntimeMode(environment), {
        debug: false,
        gpsRequired: true,
        mutationsEnabled: true
      })
    }
  })

  test('local development hosts retain debug mode when assets were built as production', () => {
    for (const hostname of ['localhost', 'app.localhost', '127.0.0.1', '::1', '[::1]']) {
      assert.equal(isLocalDevelopmentHostname(hostname), true)
    }

    assert.equal(isLocalDevelopmentHostname('livesnaps.example.com'), false)

    const previousWindow = globalThis.window
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { hostname: 'localhost' } }
    })

    try {
      assert.deepEqual(getSnapRuntimeMode('production'), {
        debug: true,
        gpsRequired: false,
        mutationsEnabled: false
      })
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as { window?: Window }).window
      } else {
        Object.defineProperty(globalThis, 'window', {
          configurable: true,
          value: previousWindow
        })
      }
    }
  })
})
