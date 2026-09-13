export type ImageOptimizationSettings = {
  imageOptimizationTimeoutMs: number
  imageQuality: number
  maxImageDimension: number
}

/** Resize and encode a browser image through the application's WebP pipeline. */
export async function optimizeImageToWebp(file: File, settings: ImageOptimizationSettings) {
  const bitmap = await createImageBitmap(file)

  try {
    const scale = Math.min(1, settings.maxImageDimension / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Unable to prepare the image.')

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob>((resolve, reject) => {
      const timeoutId = window.setTimeout(
        () => reject(new Error('Image optimization timed out. Please try a smaller image.')),
        settings.imageOptimizationTimeoutMs
      )

      canvas.toBlob(
        (output) => {
          window.clearTimeout(timeoutId)
          if (output) resolve(output)
          else reject(new Error('Unable to optimize the image.'))
        },
        'image/webp',
        settings.imageQuality
      )
    })

    if (blob.type !== 'image/webp') throw new Error('This browser could not convert the image to WebP.')

    const basename = file.name.replace(/\.[^/.]+$/, '') || 'image'
    return new File([blob], `${basename}.webp`, { type: 'image/webp', lastModified: Date.now() })
  } finally {
    bitmap.close()
  }
}
