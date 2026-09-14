import {
  getSnapImageExtension,
  isSnapImageContentType,
  SNAP_IMAGE_FORMATS,
  type SnapImageContentType
} from '@/lib/r2/snap-images'

export type SnapImageOptimizationSettings = {
  imageOptimizationTimeoutMs: number
  imageQuality: number
  maxImageDimension: number
}

type CanvasBlobEncoder = Pick<HTMLCanvasElement, 'toBlob'>

type EncodedSnapImageBlob = Blob & { readonly type: SnapImageContentType }

const CONTENT_TYPE_LABELS: Record<SnapImageContentType, string> = {
  'image/webp': 'WebP',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG'
}

const encodeCanvasAs = (
  canvas: CanvasBlobEncoder,
  contentType: SnapImageContentType,
  quality: number,
  timeoutMs: number
) =>
  new Promise<Blob | null>((resolve, reject) => {
    let settled = false
    const timeoutId = setTimeout(() => {
      settled = true
      reject(new Error(`Encoding ${CONTENT_TYPE_LABELS[contentType]} timed out.`))
    }, timeoutMs)

    const finish = (result: Blob | null) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      resolve(result)
    }

    try {
      canvas.toBlob(finish, contentType, contentType === 'image/png' ? undefined : quality)
    } catch (error) {
      if (!settled) {
        settled = true
        clearTimeout(timeoutId)
        reject(error)
      }
    }
  })

export async function encodeSnapCanvasImage(
  canvas: CanvasBlobEncoder,
  {
    contentTypes = SNAP_IMAGE_FORMATS.map(({ contentType }) => contentType),
    imageQuality,
    timeoutMs
  }: {
    contentTypes?: readonly SnapImageContentType[]
    imageQuality: number
    timeoutMs: number
  }
): Promise<EncodedSnapImageBlob> {
  for (const contentType of contentTypes) {
    try {
      const blob = await encodeCanvasAs(canvas, contentType, imageQuality, timeoutMs)

      // Browsers may silently return PNG when an encoder is unsupported. Keep
      // trying so JPEG remains preferred over the final PNG fallback.
      if (blob && blob.type === contentType) {
        return blob as EncodedSnapImageBlob
      }
    } catch {
      // Try the next supported format.
    }
  }

  const labels = contentTypes.map((contentType) => CONTENT_TYPE_LABELS[contentType]).join(', ')
  throw new Error(`This browser could not encode the image as ${labels}.`)
}

export const createSnapImageFile = (blob: Blob, basename: string, lastModified: number) => {
  if (!isSnapImageContentType(blob.type)) {
    throw new Error('The encoded image format is unsupported.')
  }

  return new File([blob], `${basename}.${getSnapImageExtension(blob.type)}`, {
    lastModified,
    type: blob.type
  })
}

/** Resize a captured image and encode it as WebP, JPEG, or finally PNG. */
export async function optimizeSnapImage(file: File, settings: SnapImageOptimizationSettings) {
  const bitmap = await createImageBitmap(file)

  try {
    const scale = Math.min(1, settings.maxImageDimension / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Unable to prepare the image.')

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const blob = await encodeSnapCanvasImage(canvas, {
      imageQuality: settings.imageQuality,
      timeoutMs: settings.imageOptimizationTimeoutMs
    })
    const basename = file.name.replace(/\.[^/.]+$/, '') || 'image'

    return createSnapImageFile(blob, basename, Date.now())
  } finally {
    bitmap.close()
  }
}
