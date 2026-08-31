import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildUserImageFilename,
  detectUserImageFormat,
  getUserImageFileError,
  isUserImageFilename,
  USER_IMAGE_FORMATS,
  USER_IMAGE_MAX_BYTES
} from './user-images'

const asciiBytes = (value: string) => Uint8Array.from(value, (character) => character.charCodeAt(0))

test('detectUserImageFormat recognizes every supported raster format by its contents', () => {
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
    assert.equal(detectUserImageFormat(fixture.bytes)?.contentType, fixture.contentType)
  }

  assert.equal(detectUserImageFormat(asciiBytes('<svg></svg>')), null)
})

test('buildUserImageFilename produces a readable collision-safe bare filename', () => {
  assert.equal(
    buildUserImageFilename('../Crème Launch DAY.JPEG', USER_IMAGE_FORMATS['image/jpeg'], 'ABC0-1234-XYZ9'),
    'creme-launch-day-abc01234xyz9.jpeg'
  )

  assert.equal(
    buildUserImageFilename('no extension', USER_IMAGE_FORMATS['image/webp'], 'upload-01'),
    'no-extension-upload01.webp'
  )
})

test('getUserImageFileError rejects missing, empty, oversized, and unsupported files', () => {
  assert.equal(getUserImageFileError(null), 'Choose an image to upload.')
  assert.equal(getUserImageFileError({ size: 0, type: 'image/png' }), 'The selected image is empty.')
  assert.equal(
    getUserImageFileError({
      size: USER_IMAGE_MAX_BYTES + 1,
      type: 'image/png'
    }),
    'The image must be 4 MB or smaller.'
  )
  assert.equal(
    getUserImageFileError({ size: 100, type: 'image/svg+xml' }),
    'Use a PNG, JPEG, WebP, AVIF, or GIF image.'
  )
  assert.equal(getUserImageFileError({ size: 100, type: 'image/webp' }), undefined)
})

test('isUserImageFilename accepts bare image filenames and rejects paths or unsafe types', () => {
  assert.equal(isUserImageFilename('launch-day-a1b2c3d4.webp'), true)
  assert.equal(isUserImageFilename('poster.JPEG'), true)
  assert.equal(isUserImageFilename('re-up/poster.webp'), false)
  assert.equal(isUserImageFilename('../poster.webp'), false)
  assert.equal(isUserImageFilename('https://example.com/poster.webp'), false)
  assert.equal(isUserImageFilename('poster.svg'), false)
})
