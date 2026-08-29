import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  formatCapturePlateNumber,
  isCompleteCapturePlateNumber,
  MAX_PLATE_NUMBER_LENGTH,
  mergeDetectedVehicleDetails,
  normalizeDetectedVehicleDetails,
  normalizePlateNumber
} from './vehicle-details'

describe('vehicle detail normalization', () => {
  test('normalizes a detected plate while preserving meaningful separators', () => {
    assert.equal(normalizePlateNumber('  abc  1234  '), 'ABC 1234')
    assert.equal(normalizePlateNumber('ncr-42'), 'NCR-42')
  })

  test('formats the capture confirmation field as three letters and four digits', () => {
    assert.equal(formatCapturePlateNumber('abc1234'), 'ABC 1234')
    assert.equal(formatCapturePlateNumber('a-b_c 12-34'), 'ABC 1234')
    // relaxed: preserves up to 10 chars, no longer forces 3+4 truncation
    assert.equal(formatCapturePlateNumber('abcd12345'), 'ABCD12345')
    assert.equal(formatCapturePlateNumber('ab12'), 'AB12')
    assert.equal(formatCapturePlateNumber('  hello 123  '), 'HELLO 123')
    assert.equal(formatCapturePlateNumber(null), '')
  })

  test('requires a complete capture plate number', () => {
    assert.equal(isCompleteCapturePlateNumber('ABC 1234'), true)
    // compact BR without space is now accepted via auto-format
    assert.equal(isCompleteCapturePlateNumber('ABC1234'), true)
    assert.equal(isCompleteCapturePlateNumber('AB 1234'), false)
    // permissive keeps 3-digit plates incomplete, but longer generic plates pass
    assert.equal(isCompleteCapturePlateNumber('ABC 123'), false)
    assert.equal(isCompleteCapturePlateNumber('ABC-1234'), true)
    assert.equal(isCompleteCapturePlateNumber('HELLO 1234'), true)
    assert.equal(isCompleteCapturePlateNumber('AB'), false)
  })

  test('turns uncertain model placeholders into unavailable values', () => {
    assert.deepEqual(
      normalizeDetectedVehicleDetails({
        plate_number: 'unreadable',
        make: 'Not visible',
        model: null
      }),
      {
        plate_number: '',
        make: '',
        model: ''
      }
    )
  })

  test('bounds model output before it reaches Convex', () => {
    assert.equal(normalizePlateNumber('x'.repeat(100)).length, MAX_PLATE_NUMBER_LENGTH)
  })

  test('keeps prior non-empty details when a later photo cannot read them', () => {
    assert.deepEqual(
      mergeDetectedVehicleDetails(
        { plate_number: '', make: 'Toyota', model: 'Vios' },
        { plate_number: 'abc 1234', make: '', model: '' }
      ),
      { plate_number: 'ABC 1234', make: 'Toyota', model: 'Vios' }
    )
  })
})
