import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildReUpImageFilename,
  detectReUpImageFormat,
  getReUpImageFileError,
  isReUpImageFilename,
  RE_UP_IMAGE_FORMATS,
  RE_UP_IMAGE_MAX_BYTES
} from './user-images'

const asciiBytes = (value: string) => Uint8Array.from(value, (character) => character.charCodeAt(0))

test('detectReUpImageFormat recognizes every supported raster format by its contents', () => {
  const fixtures = [
    {
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      contentType: 'image/png'
    },
    {
      bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),
      contentType: 'image/jpeg'
    },
    {
      bytes: asciiBytes('GIF89a'),
      contentType: 'image/gif'
    },
    {
      bytes: asciiBytes('RIFF0000WEBP'),
      contentType: 'image/webp'
    },
    {
      bytes: Uint8Array.from([0x00, 0x00, 0x00, 0x18, ...asciiBytes('ftypavif'), 0x00, 0x00, 0x00, 0x00]),
      contentType: 'image/avif'
    }
  ] as const

  for (const fixture of fixtures) {
    assert.equal(detectReUpImageFormat(fixture.bytes)?.contentType, fixture.contentType)
  }

  assert.equal(detectReUpImageFormat(asciiBytes('<svg></svg>')), null)
})

test('buildReUpImageFilename produces a readable collision-safe bare filename', () => {
  assert.equal(
    buildReUpImageFilename('../Crème Launch DAY.JPEG', RE_UP_IMAGE_FORMATS['image/jpeg'], 'ABC0-1234-XYZ9'),
    'creme-launch-day-abc01234xyz9.jpeg'
  )

  assert.equal(
    buildReUpImageFilename('no extension', RE_UP_IMAGE_FORMATS['image/webp'], 'upload-01'),
    'no-extension-upload01.webp'
  )
})

test('getReUpImageFileError rejects missing, empty, oversized, and unsupported files', () => {
  assert.equal(getReUpImageFileError(null), 'Choose an image to upload.')
  assert.equal(getReUpImageFileError({ size: 0, type: 'image/png' }), 'The selected image is empty.')
  assert.equal(
    getReUpImageFileError({
      size: RE_UP_IMAGE_MAX_BYTES + 1,
      type: 'image/png'
    }),
    'The image must be 4 MB or smaller.'
  )
  assert.equal(
    getReUpImageFileError({ size: 100, type: 'image/svg+xml' }),
    'Use a PNG, JPEG, WebP, AVIF, or GIF image.'
  )
  assert.equal(getReUpImageFileError({ size: 100, type: 'image/webp' }), undefined)
})

test('isReUpImageFilename accepts bare image filenames and rejects paths or unsafe types', () => {
  assert.equal(isReUpImageFilename('launch-day-a1b2c3d4.webp'), true)
  assert.equal(isReUpImageFilename('poster.JPEG'), true)
  assert.equal(isReUpImageFilename('re-up/poster.webp'), false)
  assert.equal(isReUpImageFilename('../poster.webp'), false)
  assert.equal(isReUpImageFilename('https://example.com/poster.webp'), false)
  assert.equal(isReUpImageFilename('poster.svg'), false)
})
