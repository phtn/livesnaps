import type { AsyncZippable } from 'fflate'
import { getSnapImageUrl } from '@/lib/r2/snap-images'
import type { AdminSnapPhoto } from './admin-photo-types'

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const UNSAFE_FILE_NAME_CHARACTERS = /[^a-z0-9_-]+/gi

const safeFileSegment = (value: string, fallback: string) =>
  value
    .trim()
    .replace(UNSAFE_FILE_NAME_CHARACTERS, '-')
    .replace(/^-+|-+$/g, '') || fallback

export const getSnapPhotoArchiveName = (uploadId: string) => `snap-photos-${safeFileSegment(uploadId, 'download')}.zip`

export const getSnapPhotoFileName = (photo: AdminSnapPhoto, index: number) => {
  const position = String(index + 1).padStart(2, '0')
  const label = safeFileSegment(photo.label, `slot-${photo.slot}`)
  return `${position}-${label}.webp`
}

const createZip = async (entries: AsyncZippable): Promise<Uint8Array<ArrayBuffer>> => {
  const { zip } = await import('fflate')

  return await new Promise((resolve, reject) => {
    zip(entries, { level: 0 }, (error, archive) => {
      if (error) {
        reject(error)
        return
      }

      resolve(archive)
    })
  })
}

export const createSnapPhotoArchive = async (
  photos: readonly AdminSnapPhoto[],
  fetcher: Fetcher = fetch,
  signal?: AbortSignal
): Promise<Uint8Array<ArrayBuffer>> => {
  if (photos.length === 0) {
    throw new Error('This proof has no photos to download.')
  }

  const files = await Promise.all(
    photos.map(async (photo, index) => {
      const response = await fetcher(getSnapImageUrl(photo.r2_key), {
        credentials: 'same-origin',
        signal
      })

      if (!response.ok) {
        throw new Error(`Unable to download ${photo.label || `photo ${index + 1}`}.`)
      }

      return [getSnapPhotoFileName(photo, index), new Uint8Array(await response.arrayBuffer())] as const
    })
  )

  return await createZip(Object.fromEntries(files))
}

export const downloadSnapPhotoArchive = async (
  photos: readonly AdminSnapPhoto[],
  uploadId: string,
  signal?: AbortSignal
): Promise<void> => {
  const archive = await createSnapPhotoArchive(photos, fetch, signal)
  const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }))
  const link = document.createElement('a')

  link.href = url
  link.download = getSnapPhotoArchiveName(uploadId)
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
