export const USER_IMAGE_MAX_BYTES = 4 * 1024 * 1024

export const USER_IMAGE_FORMATS = {
  'image/avif': {
    extension: 'avif',
    extensions: ['avif']
  },
  'image/gif': {
    extension: 'gif',
    extensions: ['gif']
  },
  'image/jpeg': {
    extension: 'jpg',
    extensions: ['jpg', 'jpeg']
  },
  'image/png': {
    extension: 'png',
    extensions: ['png']
  },
  'image/webp': {
    extension: 'webp',
    extensions: ['webp']
  }
} as const

export type UserImageContentType = keyof typeof USER_IMAGE_FORMATS
export type UserImageFormat = (typeof USER_IMAGE_FORMATS)[UserImageContentType]

export const USER_IMAGE_ACCEPT = Object.keys(USER_IMAGE_FORMATS).join(',')

const readAscii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length))

const hasBytes = (bytes: Uint8Array, signature: readonly number[]) =>
  signature.every((byte, index) => bytes[index] === byte)

export const detectUserImageFormat = (
  bytes: Uint8Array
): { contentType: UserImageContentType; format: UserImageFormat } | null => {
  if (hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return {
      contentType: 'image/png',
      format: USER_IMAGE_FORMATS['image/png']
    }
  }

  if (hasBytes(bytes, [0xff, 0xd8, 0xff])) {
    return {
      contentType: 'image/jpeg',
      format: USER_IMAGE_FORMATS['image/jpeg']
    }
  }

  const gifHeader = readAscii(bytes, 0, 6)

  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
    return {
      contentType: 'image/gif',
      format: USER_IMAGE_FORMATS['image/gif']
    }
  }

  if (bytes.length >= 12 && readAscii(bytes, 0, 4) === 'RIFF' && readAscii(bytes, 8, 4) === 'WEBP') {
    return {
      contentType: 'image/webp',
      format: USER_IMAGE_FORMATS['image/webp']
    }
  }

  if (bytes.length >= 12 && readAscii(bytes, 4, 4) === 'ftyp') {
    const brands = readAscii(bytes, 8, Math.min(bytes.length, 40) - 8)

    if (brands.includes('avif') || brands.includes('avis')) {
      return {
        contentType: 'image/avif',
        format: USER_IMAGE_FORMATS['image/avif']
      }
    }
  }

  return null
}

const getOriginalExtension = (filename: string) => {
  const basename = filename.split(/[\\/]/).at(-1) ?? ''
  const extensionIndex = basename.lastIndexOf('.')

  return extensionIndex > 0 ? basename.slice(extensionIndex + 1).toLowerCase() : ''
}

const getSafeFilenameStem = (filename: string) => {
  const basename = filename.split(/[\\/]/).at(-1) ?? ''
  const extensionIndex = basename.lastIndexOf('.')
  const stem = extensionIndex > 0 ? basename.slice(0, extensionIndex) : basename

  return (
    stem
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'app-image'
  )
}

export const buildUserImageFilename = (originalFilename: string, format: UserImageFormat, uniqueSuffix: string) => {
  const originalExtension = getOriginalExtension(originalFilename)
  const extension = (format.extensions as readonly string[]).includes(originalExtension)
    ? originalExtension
    : format.extension
  const safeSuffix =
    uniqueSuffix
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 12) || 'upload'

  return `${getSafeFilenameStem(originalFilename)}-${safeSuffix}.${extension}`
}

export const getUserImageFileError = (file: { size: number; type: string } | null) => {
  if (!file) {
    return 'Choose an image to upload.'
  }

  if (file.size <= 0) {
    return 'The selected image is empty.'
  }

  if (file.size > USER_IMAGE_MAX_BYTES) {
    return 'The image must be 4 MB or smaller.'
  }

  if (file.type && !(file.type in USER_IMAGE_FORMATS)) {
    return 'Use a PNG, JPEG, WebP, AVIF, or GIF image.'
  }

  return undefined
}

export const isUserImageFilename = (value: string) =>
  value.length <= 100 && /^[a-z0-9][a-z0-9._-]*\.(?:avif|gif|jpe?g|png|webp)$/i.test(value)
