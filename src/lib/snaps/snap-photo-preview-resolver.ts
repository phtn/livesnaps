import { getSnapSubmissionPhotoPath } from './routes'

export type SnapPhotoPreviewFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface SnapPhotoPreviewResolver {
  clear(): void
  resolve(snapId: string, slot: number): Promise<string | null>
}

interface ResolverOptions {
  createObjectUrl: (blob: Blob) => string
  fetcher: SnapPhotoPreviewFetcher
  revokeObjectUrl: (url: string) => void
}

interface PreviewEntry {
  promise: Promise<string | null>
  url?: string
}

const getPreviewKey = (snapId: string, slot: number) => `${snapId}:${slot}`

export const createSnapPhotoPreviewResolver = ({
  createObjectUrl,
  fetcher,
  revokeObjectUrl
}: ResolverOptions): SnapPhotoPreviewResolver => {
  const entries = new Map<string, PreviewEntry>()

  const clear = () => {
    for (const entry of entries.values()) {
      if (entry.url) revokeObjectUrl(entry.url)
    }
    entries.clear()
  }

  const resolve = (snapId: string, slot: number) => {
    const key = getPreviewKey(snapId, slot)
    const existing = entries.get(key)

    if (existing) return existing.promise

    const entry = {} as PreviewEntry
    entry.promise = fetcher(getSnapSubmissionPhotoPath(snapId, slot), { credentials: 'same-origin' })
      .then(async (response) => {
        if (response.status === 404) return null
        if (!response.ok) throw new Error(`Unable to load photo preview (${response.status}).`)

        const blob = await response.blob()
        if (!blob.type.startsWith('image/')) throw new Error('Photo preview response is not an image.')

        const url = createObjectUrl(blob)
        entry.url = url

        if (entries.get(key) !== entry) {
          revokeObjectUrl(url)
          return null
        }

        return url
      })
      .catch((error) => {
        if (entries.get(key) === entry) entries.delete(key)
        throw error
      })

    entries.set(key, entry)
    return entry.promise
  }

  return { clear, resolve }
}
