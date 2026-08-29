import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseLiteData, type LiteData } from './type'

const liteData: LiteData = {
  ip: '8.8.8.8',
  asn: 'AS15169',
  as_name: 'Google LLC',
  as_domain: 'google.com',
  country_code: 'US',
  country: 'United States',
  continent_code: 'NA',
  continent: 'North America'
}

test('IPinfo lite responses are narrowed to the persisted shape', () => {
  assert.deepEqual(parseLiteData({ ...liteData, bogon: false }), liteData)
})

test('incomplete IPinfo lite responses are rejected', () => {
  assert.equal(parseLiteData({ ...liteData, asn: undefined }), null)
  assert.equal(parseLiteData({ ...liteData, country_code: 1 }), null)
  assert.equal(parseLiteData(null), null)
})
