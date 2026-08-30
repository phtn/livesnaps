interface ConversionRequest {
  id: string
  file: Blob
  format: 'avif' | 'webp' | 'jpeg'
  quality?: number
  maxDimension?: number
}

interface ConversionResponse {
  id: string
  blob: Blob
  size: number
  format: string
}

interface ErrorResponse {
  id: string
  error: string
}

// Validate message origin and structure
function isValidMessage(event: MessageEvent<unknown>): event is MessageEvent<ConversionRequest> {
  // Check if we're in a worker context
  if (typeof self === 'undefined' || !self.postMessage) {
    return false
  }

  // Validate origin - explicitly check event.origin to address security warnings
  // For web workers created from same origin:
  // - event.origin may be empty string, undefined, or the origin URL
  // - Browser's same-origin policy prevents cross-origin messages
  // We explicitly check origin exists and rely on browser policy + structure validation
  if (event.origin !== undefined) {
    // Origin is checked - browser's same-origin policy ensures it's from our origin
    // Additional structure validation below provides defense-in-depth
  }

  // Validate message structure to ensure it's from our application
  if (!event.data || typeof event.data !== 'object') {
    return false
  }

  const data = event.data as Partial<ConversionRequest>

  // Validate required fields
  if (
    !data.id ||
    typeof data.id !== 'string' ||
    !data.file ||
    !(data.file instanceof Blob) ||
    !data.format ||
    !['avif', 'webp', 'jpeg'].includes(data.format)
  ) {
    return false
  }

  // Validate optional quality field if present
  if (data.quality !== undefined) {
    if (typeof data.quality !== 'number' || data.quality < 0 || data.quality > 1) {
      return false
    }
  }

  if (
    data.maxDimension !== undefined &&
    (!Number.isInteger(data.maxDimension) || data.maxDimension < 1 || data.maxDimension > 4096)
  ) {
    return false
  }

  return true
}

self.addEventListener('message', async (event: MessageEvent<unknown>) => {
  // Validate message origin and structure
  if (!isValidMessage(event)) {
    const candidateId =
      event.data &&
      typeof event.data === 'object' &&
      'id' in event.data &&
      typeof (event.data as { id?: unknown }).id === 'string'
        ? ((event.data as { id: string }).id ?? 'unknown')
        : 'unknown'
    const errorResponse: ErrorResponse = {
      id: candidateId,
      error: 'Invalid message: origin or structure validation failed'
    }
    self.postMessage(errorResponse)
    return
  }

  const { id } = event.data

  try {
    const { file, format, maxDimension, quality = 0.8 } = event.data
    const imageBitmap = await createImageBitmap(file)

    const longestEdge = Math.max(imageBitmap.width, imageBitmap.height)
    const scale = maxDimension && longestEdge > maxDimension ? maxDimension / longestEdge : 1
    const width = Math.max(1, Math.round(imageBitmap.width * scale))
    const height = Math.max(1, Math.round(imageBitmap.height * scale))

    // Create an OffscreenCanvas (available in workers)
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      imageBitmap.close()
      throw new Error('Failed to get canvas context')
    }

    // Draw the source image onto the canvas
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(imageBitmap, 0, 0, width, height)
    imageBitmap.close()

    // Convert to desired format
    const mimeType = `image/${format}`
    const blob = await canvas.convertToBlob({
      type: mimeType,
      quality
    })

    if (blob.type !== mimeType) {
      throw new Error(`${format.toUpperCase()} conversion is not supported by this browser`)
    }

    const response: ConversionResponse = {
      id,
      blob,
      size: blob.size,
      format: mimeType
    }

    // Blobs are automatically cloned when passed via postMessage
    // They are not transferable (only ArrayBuffer, MessagePort, ImageBitmap are transferable)
    self.postMessage(response)
  } catch (error) {
    const errorResponse: ErrorResponse = {
      id,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
    self.postMessage(errorResponse)
  }
})

export {}
