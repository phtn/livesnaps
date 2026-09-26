import type { AsyncZippable } from 'fflate'
import { getSnapImageExtension, getSnapImageUrl } from '@/lib/r2/snap-images'
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
  return `${position}-${label}.${getSnapImageExtension(photo.content_type)}`
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

const saveArchive = (archive: Uint8Array<ArrayBuffer>, fileName: string) => {
  const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }))
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export const downloadSnapPhotoArchive = async (
  photos: readonly AdminSnapPhoto[],
  uploadId: string,
  signal?: AbortSignal
): Promise<void> => {
  saveArchive(await createSnapPhotoArchive(photos, fetch, signal), getSnapPhotoArchiveName(uploadId))
}

/** Zips already-named files fetched from same-origin routes, e.g. stamped verification results. */
export const downloadPhotoFilesArchive = async (
  files: readonly { name: string; url: string }[],
  archiveName: string,
  signal?: AbortSignal
): Promise<void> => {
  if (files.length === 0) throw new Error('There are no photos to download.')

  const entries = await Promise.all(
    files.map(async (file) => {
      const response = await fetch(file.url, { credentials: 'same-origin', signal })
      if (!response.ok) throw new Error(`Unable to download ${file.name}.`)
      return [file.name, new Uint8Array(await response.arrayBuffer())] as const
    })
  )

  saveArchive(await createZip(Object.fromEntries(entries)), `${safeFileSegment(archiveName, 'download')}.zip`)
}
