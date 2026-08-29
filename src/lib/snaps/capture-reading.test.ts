import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { parseCaptureReading } from './capture-reading'

describe('proof capture response parsing', () => {
  test('reads plate, make, and model only from vehicle identity slots', () => {
    const response = {
      vehicle: {
        plate_number: ' nje 2990 ',
        make: 'Toyota',
        model: 'Raize'
      },
      mileage: 42_500
    }

    assert.deepEqual(parseCaptureReading(response, 1), {
      vehicle: {
        plate_number: 'NJE 2990',
        make: 'Toyota',
        model: 'Raize'
      },
      mileageKm: null
    })
    assert.deepEqual(parseCaptureReading(response, 3), {
      vehicle: null,
      mileageKm: null
    })
  })

  test('reads and validates kilometer mileage only from the odometer slot', () => {
    assert.deepEqual(parseCaptureReading({ mileage: 42_500.4 }, 5), {
      vehicle: null,
      mileageKm: 42_500.4
    })
    assert.deepEqual(parseCaptureReading({ mileage: '123,456' }, 5), {
      vehicle: null,
      mileageKm: 123_456
    })
    assert.deepEqual(parseCaptureReading({ mileage: -1 }, 5), {
      vehicle: null,
      mileageKm: null
    })
  })
})
