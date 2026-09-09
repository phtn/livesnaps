import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { submissionShareUrl } from './link-client'

describe('submission share URLs', () => {
  test('always uses the public LiveSnapsNow domain for the default Account link', () => {
    assert.equal(submissionShareUrl('northwind'), 'https://livesnapsnow.com/northwind')
  })

  test('includes a named submission link on the public domain', () => {
    assert.equal(submissionShareUrl('northwind', 'damage'), 'https://livesnapsnow.com/northwind/damage')
  })
})
