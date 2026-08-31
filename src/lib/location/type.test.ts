import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isSnapLocationCurrentAndAccurate, parseDeviceLocation, type DeviceLocation } from './type'

const location: DeviceLocation = {
  latitude: 14.5995,
  longitude: 120.9842,
  accuracy_meters: 9,
  altitude_meters: 12,
  altitude_accuracy_meters: 4,
  heading_degrees: 180,
  speed_meters_per_second: 0,
  captured_at: 1_000
}

test('device location parsing preserves every browser location field', () => {
  assert.deepEqual(parseDeviceLocation(location), location)
  assert.deepEqual(
    parseDeviceLocation({
      ...location,
      altitude_meters: undefined,
      altitude_accuracy_meters: undefined,
      heading_degrees: undefined,
      speed_meters_per_second: undefined
    }),
    {
      ...location,
      altitude_meters: null,
      altitude_accuracy_meters: null,
      heading_degrees: null,
      speed_meters_per_second: null
    }
  )
})

test('device location validation rejects impossible coordinates and stale or imprecise fixes', () => {
  assert.equal(parseDeviceLocation({ ...location, latitude: 91 }), null)
  assert.equal(parseDeviceLocation({ ...location, accuracy_meters: Number.NaN }), null)
  assert.equal(isSnapLocationCurrentAndAccurate(location, 20_000), true)
  assert.equal(isSnapLocationCurrentAndAccurate({ ...location, accuracy_meters: 21 }, 20_000), false)
  assert.equal(isSnapLocationCurrentAndAccurate(location, 40_000), false)
})
