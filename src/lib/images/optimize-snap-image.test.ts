import assert from 'node:assert/strict'
import { test } from 'node:test'
import { encodeSnapCanvasImage } from './optimize-snap-image'

const createEncoder = (outputs: Partial<Record<string, Blob | null>>, calls: string[]) => ({
  toBlob(callback: BlobCallback, type?: string) {
    const contentType = type ?? 'image/png'
    calls.push(contentType)
    callback(outputs[contentType] ?? null)
  }
})

test('keeps WebP as the first-choice capture format', async () => {
  const calls: string[] = []
  const webp = new Blob(['webp'], { type: 'image/webp' })
  const canvas = createEncoder({ 'image/webp': webp }, calls)

  assert.equal(await encodeSnapCanvasImage(canvas, { imageQuality: 0.8, timeoutMs: 100 }), webp)
  assert.deepEqual(calls, ['image/webp'])
})

test('prefers JPEG when WebP encoding falls back to PNG', async () => {
  const calls: string[] = []
  const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' })
  const canvas = createEncoder(
    {
      'image/webp': new Blob(['implicit fallback'], { type: 'image/png' }),
      'image/jpeg': jpeg
    },
    calls
  )

  assert.equal(await encodeSnapCanvasImage(canvas, { imageQuality: 0.8, timeoutMs: 100 }), jpeg)
  assert.deepEqual(calls, ['image/webp', 'image/jpeg'])
})

test('uses PNG only after WebP and JPEG are unavailable', async () => {
  const calls: string[] = []
  const png = new Blob(['png'], { type: 'image/png' })
  const canvas = createEncoder(
    {
      'image/webp': null,
      'image/jpeg': new Blob(['implicit fallback'], { type: 'image/png' }),
      'image/png': png
    },
    calls
  )

  assert.equal(await encodeSnapCanvasImage(canvas, { imageQuality: 0.8, timeoutMs: 100 }), png)
  assert.deepEqual(calls, ['image/webp', 'image/jpeg', 'image/png'])
})

test('supports a JPEG then PNG source-capture fallback order', async () => {
  const calls: string[] = []
  const png = new Blob(['png'], { type: 'image/png' })
  const canvas = createEncoder({ 'image/jpeg': null, 'image/png': png }, calls)

  assert.equal(
    await encodeSnapCanvasImage(canvas, {
      contentTypes: ['image/jpeg', 'image/png'],
      imageQuality: 1,
      timeoutMs: 100
    }),
    png
  )
  assert.deepEqual(calls, ['image/jpeg', 'image/png'])
})
