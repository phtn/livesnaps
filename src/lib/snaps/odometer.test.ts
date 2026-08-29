import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  MAX_VEHICLE_MILEAGE,
  normalizeMileage,
  normalizeOdometerReading,
  ODOMETER_DISTANCE_UNIT
} from './odometer'

describe('odometer normalization', () => {
  test('normalizes grouped mileage and preserves one visible decimal place', () => {
    assert.equal(normalizeMileage('123,456'), 123_456)
    assert.equal(normalizeMileage(12_345.6), 12_345.6)
  })

  test('rejects invalid or implausibly large mileage values', () => {
    assert.equal(normalizeMileage('unreadable'), null)
    assert.equal(normalizeMileage(-1), null)
    assert.equal(normalizeMileage(MAX_VEHICLE_MILEAGE + 0.1), null)
  })

  test('parses the structured dashboard reading explicitly as kilometers', () => {
    assert.equal(ODOMETER_DISTANCE_UNIT, 'km')
    assert.equal(normalizeOdometerReading({ mileage_km: 42_500 }), 42_500)
    assert.equal(normalizeOdometerReading({ mileage_km: '123,456.7' }), 123_456.7)
    assert.equal(normalizeOdometerReading({ mileage: 42_500 }), null)
  })
})
