import assert from 'node:assert/strict'
import { test } from 'node:test'
import { strFromU8, unzipSync } from 'fflate'
import type { AdminProofPhoto } from './admin-photo-types'
import {
  createProofPhotoArchive,
  getProofPhotoArchiveName,
  getProofPhotoFileName
} from './photo-download'

const uploadId = '550e8400-e29b-41d4-a716-446655440000'
const firstCaptureId = '96c6bc92-61e2-46ab-a9c0-6e5443bd18c2'
const secondCaptureId = '130411f4-e45b-4d92-a96c-3b5b3d210dda'

const photos: AdminProofPhoto[] = [
  {
    capture_id: firstCaptureId,
    captured_at: 1,
    content_type: 'image/webp',
    label: 'front view',
    r2_key: `proofs/${uploadId}/1-front-${firstCaptureId}.webp`,
    size: 5,
    slot: 1
  },
  {
    capture_id: secondCaptureId,
    captured_at: 2,
    content_type: 'image/webp',
    label: 'side / B',
    r2_key: `proofs/${uploadId}/4-side-b-${secondCaptureId}.webp`,
    size: 4,
    slot: 4
  }
]

test('proof photo download names are safe and stable', () => {
  assert.equal(getProofPhotoArchiveName(uploadId), `proof-photos-${uploadId}.zip`)
  assert.equal(getProofPhotoFileName(photos[0], 0), '01-front-view.webp')
  assert.equal(getProofPhotoFileName(photos[1], 1), '02-side-B.webp')
})

test('proof photos are fetched from their protected routes and archived together', async () => {
  const requestedUrls: string[] = []
  const bodies = [new TextEncoder().encode('front'), new TextEncoder().encode('side')]
  const archive = await createProofPhotoArchive(photos, async (input) => {
    requestedUrls.push(String(input))
    const body = bodies[requestedUrls.length - 1]
    return new Response(body, { status: 200, headers: { 'Content-Type': 'image/webp' } })
  })
  const files = unzipSync(archive)

  assert.deepEqual(requestedUrls, [
    `/api/r2/proofs/${uploadId}/1-front-${firstCaptureId}.webp`,
    `/api/r2/proofs/${uploadId}/4-side-b-${secondCaptureId}.webp`
  ])
  assert.deepEqual(Object.keys(files), ['01-front-view.webp', '02-side-B.webp'])
  assert.equal(strFromU8(files['01-front-view.webp']!), 'front')
  assert.equal(strFromU8(files['02-side-B.webp']!), 'side')
})

test('empty proof photo collections cannot create a misleading archive', async () => {
  await assert.rejects(createProofPhotoArchive([]), /no photos/i)
})
