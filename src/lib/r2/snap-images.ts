export const SNAP_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const SNAP_STORAGE_PREFIX = 'snaps/' as const

export const SNAP_SLOTS = [
  { index: 1, label: 'front', slug: 'front' },
  { index: 2, label: 'back', slug: 'back' },
  { index: 3, label: 'side A', slug: 'side-a' },
  { index: 4, label: 'side B', slug: 'side-b' },
  { index: 5, label: 'odometer', slug: 'odometer' }
] as const

export type SnapSlotIndex = (typeof SNAP_SLOTS)[number]['index']

const SNAP_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const isSnapUploadId = (value: string) => SNAP_ID_PATTERN.test(value)
export const isSnapCaptureId = (value: string) => SNAP_ID_PATTERN.test(value)

export const getSnapSlot = (index: number) => SNAP_SLOTS.find((slot) => slot.index === index)

export const buildSnapObjectKey = (uploadId: string, slotIndex: SnapSlotIndex, captureId: string) => {
  if (!isSnapUploadId(uploadId)) {
    throw new Error('Invalid Snap upload ID.')
  }

  if (!isSnapCaptureId(captureId)) {
    throw new Error('Invalid Snap capture ID.')
  }

  const slot = getSnapSlot(slotIndex)

  if (!slot) {
    throw new Error('Invalid Snap photo slot.')
  }

  return `${SNAP_STORAGE_PREFIX}${uploadId}/${slot.index}-${slot.slug}-${captureId}.webp`
}

export const isSnapObjectKey = (value: string) =>
  SNAP_SLOTS.some((slot) => {
    const prefixLength = SNAP_STORAGE_PREFIX.length
    const separatorIndex = value.indexOf('/', prefixLength)

    if (separatorIndex === -1) {
      return false
    }

    const uploadId = value.slice(prefixLength, separatorIndex)
    const filename = value.slice(separatorIndex + 1)
    const filenamePrefix = `${slot.index}-${slot.slug}-`
    const captureId = filename.startsWith(filenamePrefix) ? filename.slice(filenamePrefix.length, -'.webp'.length) : ''

    return (
      isSnapUploadId(uploadId) &&
      isSnapCaptureId(captureId) &&
      value === buildSnapObjectKey(uploadId, slot.index, captureId)
    )
  })

export const getSnapImageUrl = (objectKey: string) => {
  if (!isSnapObjectKey(objectKey)) {
    throw new Error('Invalid snap photo object key.')
  }

  return `/api/r2/${objectKey.split('/').map(encodeURIComponent).join('/')}`
}
