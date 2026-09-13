import { randomUUID } from 'node:crypto'
import type { FileUIPart } from 'ai'
import { META_FILES_API_PURPOSE } from './meta'

export const VISION_SUPPORTED_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/json',
  'text/csv'
] as const

export const VISION_MAX_FILE_BYTES = 20 * 1024 * 1024
export const VISION_MAX_FILES = 20

export type VisionFileCategory = 'image' | 'video' | 'pdf' | 'document'

export const getFileCategory = (mediaType: string): VisionFileCategory => {
  if (mediaType.startsWith('image/')) return 'image'
  if (mediaType.startsWith('video/')) return 'video'
  if (mediaType === 'application/pdf') return 'pdf'
  return 'document'
}

export const isVisionFile = (part: FileUIPart): boolean => {
  const mt = part.mediaType ?? ''
  return (
    mt.startsWith('image/') ||
    mt.startsWith('video/') ||
    mt === 'application/pdf' ||
    mt.startsWith('text/') ||
    mt === 'application/json' ||
    mt === 'application/msword' ||
    mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
}

export const isDataUrl = (url: string): boolean => url.startsWith('data:')

export const dataUrlToBytes = (dataUrl: string): { bytes: Uint8Array; mediaType: string } | null => {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex === -1) return null
  const meta = dataUrl.slice(5, commaIndex)
  const data = dataUrl.slice(commaIndex + 1)
  const isBase64 = meta.includes(';base64')
  const mediaType = meta.split(';')[0] || 'application/octet-stream'

  try {
    if (isBase64) {
      const binary = Buffer.from(data, 'base64')
      return { bytes: new Uint8Array(binary), mediaType }
    } else {
      const decoded = decodeURIComponent(data)
      return { bytes: new TextEncoder().encode(decoded), mediaType }
    }
  } catch {
    return null
  }
}

export const getFileExtension = (mediaType: string, filename?: string): string => {
  if (filename?.includes('.')) {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (ext) return ext
  }
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'text/markdown': 'md',
    'application/json': 'json',
    'text/csv': 'csv'
  }
  return map[mediaType] ?? 'bin'
}

export interface UploadedVisionFile {
  fileId: string
  url: string
  filename: string
  mediaType: string
  category: VisionFileCategory
  byteLength: number
  providerFileId?: string
  storageKey?: string
}

// R2 upload helper - uses server-only putR2Object when available
export const uploadToR2FilesAPI = async (
  bytes: Uint8Array,
  filename: string,
  mediaType: string
): Promise<UploadedVisionFile> => {
  const ext = getFileExtension(mediaType, filename)
  const fileId = randomUUID()
  const storageKey = `chat/vision/${fileId}.${ext}`

  // Dynamic import to avoid bundling server-only code in client
  const { putR2Object } = await import('@/lib/r2/server')
  const response = await putR2Object({
    body: bytes.buffer as ArrayBuffer,
    contentType: mediaType,
    objectKey: storageKey
  })

  if (!response.ok) {
    throw new Error(`R2 upload failed: ${response.status} ${response.statusText}`)
  }

  // Construct public URL via NEXT_PUBLIC_R2_PUBLIC_URL or fallback to request origin handling
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, '') ?? ''
  const url = publicBase
    ? `${publicBase}/${storageKey}`
    : `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/livesnaps/${storageKey}`

  return {
    fileId,
    url,
    filename: filename || `file-${fileId}.${ext}`,
    mediaType,
    category: getFileCategory(mediaType),
    byteLength: bytes.byteLength,
    storageKey
  }
}

// Provider Files API upload for Meta/OpenAI-compatible
export const uploadToProviderFilesAPI = async (
  bytes: Uint8Array,
  filename: string,
  mediaType: string,
  provider: 'meta' | 'cohere'
): Promise<{ fileId: string; provider: string } | null> => {
  if (provider === 'meta') {
    const apiKey = process.env.META_API_KEY
    const baseURL = process.env.META_BASE_URL ?? 'https://api.meta.ai/v1'
    if (!apiKey || !baseURL) return null

    try {
      const form = new FormData()
      const blob = new Blob([bytes as unknown as BlobPart], { type: mediaType })
      form.append('file', blob, filename)
      form.append('purpose', META_FILES_API_PURPOSE)

      // Try OpenAI-compatible Files API
      const response = await fetch(`${baseURL.replace(/\/$/, '')}/files`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`
        },
        body: form
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        console.warn('[Files API] Meta upload failed, falling back to R2', {
          status: response.status,
          text: text.slice(0, 200)
        })
        return null
      }

      const data = (await response.json()) as { id?: string; file_id?: string }
      const fileId = data.id ?? data.file_id
      if (!fileId) return null

      return { fileId, provider: 'meta' }
    } catch (e) {
      console.warn('[Files API] Meta upload error, falling back to R2', e)
      return null
    }
  }

  if (provider === 'cohere') {
    // Cohere does not have a public Files API for vision; fallback to R2/Data URL
    return null
  }

  return null
}

// Main helper: ensure FileUIPart is available via Files API (R2 or provider)
export const ensureFileViaFilesAPI = async (
  part: FileUIPart,
  provider: 'cohere' | 'meta' = 'cohere'
): Promise<FileUIPart> => {
  // If already an https URL (not data:), assume it's already via Files API/R2
  if (part.url.startsWith('https://') || part.url.startsWith('http://')) {
    return part
  }

  if (!isDataUrl(part.url)) {
    // blob: or unknown - try to fetch and convert
    try {
      const res = await fetch(part.url)
      const blob = await res.blob()
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const mediaType = part.mediaType || blob.type || 'application/octet-stream'
      const uploaded = await uploadToR2FilesAPI(bytes, part.filename ?? 'file', mediaType)

      // Try provider Files API as well for better provider-native handling
      await uploadToProviderFilesAPI(bytes, part.filename ?? 'file', mediaType, provider)

      return {
        ...part,
        url: uploaded.url,
        mediaType: uploaded.mediaType
      }
    } catch {
      return part
    }
  }

  const parsed = dataUrlToBytes(part.url)
  if (!parsed) return part

  const { bytes, mediaType: parsedMediaType } = parsed
  const mediaType = part.mediaType || parsedMediaType
  const filename = part.filename ?? `file-${randomUUID()}.${getFileExtension(mediaType)}`

  // For large files or videos/pdfs, prefer Files API; for small images, data URL is okay but we still use Files API for consistency
  const shouldUseFilesAPI = bytes.byteLength > 512 * 1024 || getFileCategory(mediaType) !== 'image'

  if (!shouldUseFilesAPI && bytes.byteLength < 2 * 1024 * 1024) {
    // Keep small images as data URL to avoid extra latency, unless provider prefers Files API
    // For Meta with video/pdf, always use Files API
    if (provider === 'meta' && (mediaType.startsWith('video/') || mediaType === 'application/pdf')) {
      // fall through to upload
    } else {
      return part
    }
  }

  try {
    // Try provider Files API first for native handling
    const providerFile = await uploadToProviderFilesAPI(bytes, filename, mediaType, provider)
    if (providerFile) {
      // Provider file IDs can be referenced via special URL or kept as data URL fallback
      // For now, also upload to R2 for URL access and return R2 URL (provider file as backup)
      const r2File = await uploadToR2FilesAPI(bytes, filename, mediaType)
      return {
        ...part,
        url: r2File.url,
        mediaType: r2File.mediaType
      }
    }

    const uploaded = await uploadToR2FilesAPI(bytes, filename, mediaType)
    return {
      ...part,
      url: uploaded.url,
      mediaType: uploaded.mediaType
    }
  } catch (e) {
    console.warn('[Files API] Upload failed, keeping original data URL', e)
    return part
  }
}

export const ensureVisionFilesViaFilesAPI = async (
  parts: FileUIPart[],
  provider: 'cohere' | 'meta' = 'cohere'
): Promise<FileUIPart[]> => {
  const results: FileUIPart[] = []
  for (const part of parts) {
    if (!isVisionFile(part)) {
      results.push(part)
      continue
    }
    const ensured = await ensureFileViaFilesAPI(part, provider)
    results.push(ensured)
  }
  return results
}

export const getVisionStatsViaFilesAPI = (messages: unknown[]) => {
  let count = 0
  let byteLength = 0
  let hasVideo = false
  let hasPdf = false
  let hasDocument = false

  for (const message of messages) {
    if (!message || typeof message !== 'object') continue
    const parts = (message as { parts?: unknown }).parts
    if (!Array.isArray(parts)) continue

    for (const part of parts) {
      if (!part || typeof part !== 'object' || !('type' in part) || (part as { type: string }).type !== 'file') continue
      const p = part as FileUIPart
      const mt = p.mediaType ?? ''
      if (mt.startsWith('image/')) {
        count += 1
        // Estimate bytes from url if data URL, else count as 0 for R2 URLs
        if (p.url.startsWith('data:')) {
          const parsed = dataUrlToBytes(p.url)
          if (parsed) byteLength += parsed.bytes.byteLength
        }
      } else if (mt.startsWith('video/')) {
        hasVideo = true
        count += 1
      } else if (mt === 'application/pdf') {
        hasPdf = true
        count += 1
      } else if (mt.startsWith('text/') || mt === 'application/json') {
        hasDocument = true
        count += 1
      }
    }
  }

  return { count, byteLength, hasVideo, hasPdf, hasDocument }
}
