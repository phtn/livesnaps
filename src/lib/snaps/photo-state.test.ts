import assert from 'node:assert/strict'
import { test } from 'node:test'
import { updateSnapPhotos } from './photo-state'

type Photo = {
  captureId: string
  slot: number
}

const frontPhoto: Photo = { captureId: 'front-original', slot: 1 }
const frontRetake: Photo = { captureId: 'front-retake', slot: 1 }
const backPhoto: Photo = { captureId: 'back-original', slot: 2 }

test('normal captures fill empty slots without changing existing photos', () => {
  assert.deepEqual(updateSnapPhotos([frontPhoto], backPhoto, false), {
    photos: [frontPhoto, backPhoto],
    status: 'updated'
  })
})

test('an occupied Convex slot is replaced only when the capture is an explicit retake', () => {
  assert.deepEqual(updateSnapPhotos([frontPhoto], frontRetake, false), {
    status: 'occupied_without_retake'
  })
  assert.deepEqual(updateSnapPhotos([frontPhoto], frontRetake, true), {
    photos: [frontRetake],
    status: 'updated'
  })
})

test('retakes cannot replace a missing Convex slot', () => {
  assert.deepEqual(updateSnapPhotos([], frontRetake, true), {
    status: 'missing_retake_target'
  })
})
