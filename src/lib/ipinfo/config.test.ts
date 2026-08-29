import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseIpinfoConfig } from './config'

test('a direct IPinfo environment token configures the lite service', () => {
  assert.deepEqual(parseIpinfoConfig('lite-token'), {
    enabledService: 'lite',
    lite: { token: 'lite-token' },
    core: { token: '' },
    plus: { token: '' },
    max: { token: '' }
  })
})
