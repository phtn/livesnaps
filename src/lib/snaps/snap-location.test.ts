import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepareSnapLocation } from './snap-location'

const address = {
  attribution: '© Mapbox',
  city: 'Makati',
  components: {},
  country: 'Philippines',
  country_code: 'PH',
  country_code_alpha_3: 'PHL',
  feature_type: 'address',
  full_address: 'Ayala Avenue, Makati, Philippines',
  latitude: 14.5547,
  locality: 'Makati',
  longitude: 121.0244,
  mapbox_id: 'address.example',
  postcode: '1226',
  provider: 'mapbox' as const,
  region: 'Metro Manila',
  street_name: 'Ayala Avenue'
}

test('prepares the proof location payload from a ready location session', () => {
  assert.deepEqual(
    prepareSnapLocation({
      address,
      best_accuracy_meters: 8.4,
      country_code_matches_ipinfo: true
    }),
    {
      address: {
        city: 'Makati',
        country: 'Philippines',
        country_code: 'PH',
        country_code_alpha_3: 'PHL',
        feature_type: 'address',
        full_address: 'Ayala Avenue, Makati, Philippines',
        latitude: 14.5547,
        locality: 'Makati',
        longitude: 121.0244,
        mapbox_id: 'address.example',
        postcode: '1226',
        provider: 'mapbox',
        region: 'Metro Manila',
        street_name: 'Ayala Avenue'
      },
      best_accuracy_meters: 8.4,
      country_code_matches_ipinfo: true
    }
  )
})

test('normalizes optional address fields and an unknown country comparison', () => {
  const location = prepareSnapLocation({
    address: {
      ...address,
      city: undefined,
      country_code_alpha_3: undefined,
      locality: undefined,
      postcode: undefined,
      region: undefined,
      street_name: undefined
    },
    best_accuracy_meters: 12,
    country_code_matches_ipinfo: null
  })

  assert.equal(location.address.city, '')
  assert.equal(location.address.country_code_alpha_3, '')
  assert.equal(location.address.locality, '')
  assert.equal(location.address.postcode, '')
  assert.equal(location.address.region, '')
  assert.equal(location.address.street_name, '')
  assert.equal(location.country_code_matches_ipinfo, false)
})
