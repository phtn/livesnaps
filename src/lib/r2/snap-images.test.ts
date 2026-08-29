import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildProofObjectKey,
  getProofImageUrl,
  isProofObjectKey,
  isProofUploadId,
  PROOF_STORAGE_PREFIX
} from './snap-images'

const uploadId = '550e8400-e29b-41d4-a716-446655440000'
const firstCaptureId = '96c6bc92-61e2-46ab-a9c0-6e5443bd18c2'
const secondCaptureId = '130411f4-e45b-4d92-a96c-3b5b3d210dda'

test('proof object keys use the proofs prefix and preserve every capture ID', () => {
  assert.equal(PROOF_STORAGE_PREFIX, 'proofs/')
  assert.equal(buildProofObjectKey(uploadId, 1, firstCaptureId), `proofs/${uploadId}/1-front-${firstCaptureId}.webp`)
  assert.notEqual(buildProofObjectKey(uploadId, 1, firstCaptureId), buildProofObjectKey(uploadId, 1, secondCaptureId))
  assert.equal(
    buildProofObjectKey(uploadId, 5, secondCaptureId),
    `proofs/${uploadId}/5-odometer-${secondCaptureId}.webp`
  )
})

test('proof upload IDs and object keys reject unsafe paths', () => {
  assert.equal(isProofUploadId(uploadId), true)
  assert.equal(isProofUploadId('../proofs'), false)
  assert.equal(isProofObjectKey(`proofs/${uploadId}/4-side-b-${firstCaptureId}.webp`), true)
  assert.equal(isProofObjectKey(`re-up/${uploadId}/4-side-b-${firstCaptureId}.webp`), false)
  assert.equal(isProofObjectKey(`proofs/${uploadId}/../4-side-b-${firstCaptureId}.webp`), false)
  assert.equal(isProofObjectKey(`proofs/${uploadId}/4-side-b-${firstCaptureId}.jpg`), false)
})

test('proof image URLs preserve validated object-key path segments', () => {
  const objectKey = buildProofObjectKey(uploadId, 3, firstCaptureId)

  assert.equal(getProofImageUrl(objectKey), `/api/r2/proofs/${uploadId}/3-side-a-${firstCaptureId}.webp`)
  assert.throws(() => getProofImageUrl(`proofs/${uploadId}/../secret.webp`), /Invalid proof photo object key/)
})
