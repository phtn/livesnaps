import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSnapPhotoPreviewResolver } from './snap-photo-preview-resolver'

test('snap photo previews deduplicate in-flight requests and reuse the resolved URL', async () => {
  const requestedUrls: string[] = []
  const resolver = createSnapPhotoPreviewResolver({
    createObjectUrl: () => 'blob:front-preview',
    fetcher: async (input) => {
      requestedUrls.push(String(input))
      return new Response(new Blob(['preview'], { type: 'image/webp' }))
    },
    revokeObjectUrl: () => {}
  })

  const [first, second] = await Promise.all([
    resolver.resolve('snap-id', 1),
    resolver.resolve('snap-id', 1)
  ])

  assert.equal(first, 'blob:front-preview')
  assert.equal(second, 'blob:front-preview')
  assert.deepEqual(requestedUrls, ['/api/snaps/snap-id/photos/1'])
  assert.equal(await resolver.resolve('snap-id', 1), 'blob:front-preview')
  assert.equal(requestedUrls.length, 1)
})

test('clearing previews revokes cached object URLs and allows a fresh resolution', async () => {
  const revokedUrls: string[] = []
  let objectUrlNumber = 0
  const resolver = createSnapPhotoPreviewResolver({
    createObjectUrl: () => `blob:preview-${++objectUrlNumber}`,
    fetcher: async () => new Response(new Blob(['preview'], { type: 'image/webp' })),
    revokeObjectUrl: (url) => revokedUrls.push(url)
  })

  assert.equal(await resolver.resolve('snap-id', 2), 'blob:preview-1')
  resolver.clear()
  assert.deepEqual(revokedUrls, ['blob:preview-1'])
  assert.equal(await resolver.resolve('snap-id', 2), 'blob:preview-2')
})
