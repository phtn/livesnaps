import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseMapboxAddress } from './mapbox'

test('Mapbox responses retain detailed address and lot components', () => {
  const address = parseMapboxAddress({
    attribution: 'NOTICE: © 2026 Mapbox',
    features: [
      {
        properties: {
          mapbox_id: 'mapbox-address-id',
          feature_type: 'address',
          full_address: 'Lot 7, 10 Example Street, Manila 1000, Philippines',
          coordinates: {
            longitude: 120.9842,
            latitude: 14.5995,
            accuracy: 'parcel'
          },
          context: {
            secondary_address: { name: 'LOT 7', designator: 'LOT', identifier: '7' },
            address: { address_number: '10', street_name: 'Example Street' },
            neighborhood: { name: 'Ermita' },
            place: { name: 'Manila' },
            postcode: { name: '1000' },
            region: { name: 'Metro Manila', region_code: 'PH-00' },
            country: { name: 'Philippines', country_code: 'PH', country_code_alpha_3: 'PHL' }
          }
        }
      }
    ]
  })

  assert.equal(address?.lot_number, '7')
  assert.equal(address?.street_name, 'Example Street')
  assert.equal(address?.city, 'Manila')
  assert.equal(address?.accuracy, 'parcel')
  assert.equal(address?.components['context.secondary_address.identifier'], '7')
})

test('Mapbox responses without a usable feature are rejected', () => {
  assert.equal(parseMapboxAddress({ features: [] }), null)
  assert.equal(parseMapboxAddress({ features: [{ properties: { feature_type: 'address' } }] }), null)
})
