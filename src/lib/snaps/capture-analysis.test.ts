import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getVehicleInspectionView } from './capture-analysis'

describe('proof capture analysis', () => {
  test('always analyzes the front slot for a plate', () => {
    assert.equal(getVehicleInspectionView(1, ''), 'front')
    assert.equal(getVehicleInspectionView(1, 'ABC 1234'), 'front')
  })

  test('uses the back slot only as a plate fallback', () => {
    assert.equal(getVehicleInspectionView(2, ''), 'back')
    assert.equal(getVehicleInspectionView(2, 'ABC 1234'), null)
    assert.equal(getVehicleInspectionView(3, ''), null)
    assert.equal(getVehicleInspectionView(5, ''), null)
  })

  test('does not inspect the back when the front plate is already available', () => {
    assert.equal(getVehicleInspectionView(2, { plate_number: 'ABC 1234', make: '', model: '' }), null)
    assert.equal(getVehicleInspectionView(2, { plate_number: 'ABC 1234', make: 'Toyota', model: '' }), null)
    assert.equal(getVehicleInspectionView(2, { plate_number: 'ABC 1234', make: 'Toyota', model: 'Corolla' }), null)
  })
})
