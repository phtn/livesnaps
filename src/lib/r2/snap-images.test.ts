import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildSnapObjectKey,
  getSnapImageContentType,
  getSnapImageExtension,
  getSnapImageUrl,
  isSnapObjectKey,
  isSnapUploadId,
  SNAP_STORAGE_PREFIX
} from './snap-images'

const uploadId = '550e8400-e29b-41d4-a716-446655440000'
const firstCaptureId = '96c6bc92-61e2-46ab-a9c0-6e5443bd18c2'
const secondCaptureId = '130411f4-e45b-4d92-a96c-3b5b3d210dda'

test('snap object keys use the snaps prefix and preserve every capture ID', () => {
  assert.equal(SNAP_STORAGE_PREFIX, 'snaps/')
  assert.equal(buildSnapObjectKey(uploadId, 1, firstCaptureId), `snaps/${uploadId}/1-front-${firstCaptureId}.webp`)
  assert.notEqual(buildSnapObjectKey(uploadId, 1, firstCaptureId), buildSnapObjectKey(uploadId, 1, secondCaptureId))
  assert.equal(
    buildSnapObjectKey(uploadId, 5, secondCaptureId, 'image/jpeg'),
    `snaps/${uploadId}/5-odometer-${secondCaptureId}.jpg`
  )
  assert.equal(
    buildSnapObjectKey(uploadId, 3, secondCaptureId, 'image/png'),
    `snaps/${uploadId}/3-side-a-${secondCaptureId}.png`
  )
})

test('snap upload IDs and object keys reject unsafe paths', () => {
  assert.equal(isSnapUploadId(uploadId), true)
  assert.equal(isSnapUploadId('../snaps'), false)
  assert.equal(isSnapObjectKey(`snaps/${uploadId}/4-side-b-${firstCaptureId}.webp`), true)
  assert.equal(isSnapObjectKey(`snaps/${uploadId}/4-side-b-${firstCaptureId}.jpg`), true)
  assert.equal(isSnapObjectKey(`snaps/${uploadId}/4-side-b-${firstCaptureId}.png`), true)
  assert.equal(isSnapObjectKey(`user/${uploadId}/4-side-b-${firstCaptureId}.webp`), false)
  assert.equal(isSnapObjectKey(`snaps/${uploadId}/../4-side-b-${firstCaptureId}.webp`), false)
  assert.equal(isSnapObjectKey(`snaps/${uploadId}/4-side-b-${firstCaptureId}.jpeg`), false)
  assert.equal(isSnapObjectKey(`snaps/${uploadId}/4-side-b-${firstCaptureId}.gif`), false)
})

test('snap image formats map content types to canonical object-key extensions', () => {
  assert.equal(getSnapImageExtension('image/webp'), 'webp')
  assert.equal(getSnapImageExtension('image/jpeg'), 'jpg')
  assert.equal(getSnapImageExtension('image/png'), 'png')
  assert.equal(getSnapImageContentType(`snaps/${uploadId}/1-front-${firstCaptureId}.webp`), 'image/webp')
  assert.equal(getSnapImageContentType(`snaps/${uploadId}/1-front-${firstCaptureId}.jpg`), 'image/jpeg')
  assert.equal(getSnapImageContentType(`snaps/${uploadId}/1-front-${firstCaptureId}.png`), 'image/png')
  assert.equal(getSnapImageContentType(`snaps/${uploadId}/1-front-${firstCaptureId}.gif`), null)
})

test('snap image URLs preserve validated object-key path segments', () => {
  const objectKey = buildSnapObjectKey(uploadId, 3, firstCaptureId)

  assert.equal(getSnapImageUrl(objectKey), `/api/r2/snaps/${uploadId}/3-side-a-${firstCaptureId}.webp`)
  assert.throws(() => getSnapImageUrl(`snaps/${uploadId}/../secret.webp`), /Invalid snap photo object key/)
})
