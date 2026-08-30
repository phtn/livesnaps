export type ImageCaptureSettingsValues = {
  cameraIdealHeight: number
  cameraIdealWidth: number
  imageOptimizationTimeoutMs: number
  imageQuality: number
  maxImageDimension: number
  sourceJpegQuality: number
}

export const IMAGE_CAPTURE_SETTINGS_KEY = 'livesnaps' as const

export const DEFAULT_IMAGE_CAPTURE_SETTINGS = {
  cameraIdealHeight: 2160,
  cameraIdealWidth: 4096,
  imageOptimizationTimeoutMs: 30_000,
  imageQuality: 0.8,
  maxImageDimension: 4096,
  sourceJpegQuality: 1
} satisfies ImageCaptureSettingsValues

export const IMAGE_CAPTURE_SETTINGS_CONSTRAINTS = {
  cameraIdealHeight: { min: 240, max: 8192, step: 1 },
  cameraIdealWidth: { min: 320, max: 8192, step: 1 },
  imageOptimizationTimeoutMs: { min: 1_000, max: 120_000, step: 1_000 },
  imageQuality: { min: 0.1, max: 1, step: 0.05 },
  maxImageDimension: { min: 256, max: 4096, step: 1 },
  sourceJpegQuality: { min: 0.1, max: 1, step: 0.05 }
} as const satisfies Record<keyof ImageCaptureSettingsValues, { min: number; max: number; step: number }>

const isNumberInRange = (value: number, minimum: number, maximum: number) =>
  Number.isFinite(value) && value >= minimum && value <= maximum

const isIntegerInRange = (value: number, minimum: number, maximum: number) =>
  Number.isSafeInteger(value) && value >= minimum && value <= maximum

export const getSnapSettingsValidationError = (settings: ImageCaptureSettingsValues) => {
  if (
    !isNumberInRange(
      settings.imageQuality,
      IMAGE_CAPTURE_SETTINGS_CONSTRAINTS.imageQuality.min,
      IMAGE_CAPTURE_SETTINGS_CONSTRAINTS.imageQuality.max
    )
  ) {
    return 'WebP image quality must be between 0.1 and 1.'
  }

  if (
    !isIntegerInRange(
      settings.maxImageDimension,
      IMAGE_CAPTURE_SETTINGS_CONSTRAINTS.maxImageDimension.min,
      IMAGE_CAPTURE_SETTINGS_CONSTRAINTS.maxImageDimension.max
    )
  ) {
    return 'Maximum image dimension must be an integer between 256 and 4096 pixels.'
  }

  if (
    !isNumberInRange(
      settings.sourceJpegQuality,
      IMAGE_CAPTURE_SETTINGS_CONSTRAINTS.sourceJpegQuality.min,
      IMAGE_CAPTURE_SETTINGS_CONSTRAINTS.sourceJpegQuality.max
    )
  ) {
    return 'Source JPEG quality must be between 0.1 and 1.'
  }

  if (
    !isIntegerInRange(
      settings.imageOptimizationTimeoutMs,
      IMAGE_CAPTURE_SETTINGS_CONSTRAINTS.imageOptimizationTimeoutMs.min,
      IMAGE_CAPTURE_SETTINGS_CONSTRAINTS.imageOptimizationTimeoutMs.max
    )
  ) {
    return 'Image optimization timeout must be an integer between 1,000 and 120,000 milliseconds.'
  }

  if (
    !isIntegerInRange(
      settings.cameraIdealWidth,
      IMAGE_CAPTURE_SETTINGS_CONSTRAINTS.cameraIdealWidth.min,
      IMAGE_CAPTURE_SETTINGS_CONSTRAINTS.cameraIdealWidth.max
    )
  ) {
    return 'Preferred camera width must be an integer between 320 and 8,192 pixels.'
  }

  if (
    !isIntegerInRange(
      settings.cameraIdealHeight,
      IMAGE_CAPTURE_SETTINGS_CONSTRAINTS.cameraIdealHeight.min,
      IMAGE_CAPTURE_SETTINGS_CONSTRAINTS.cameraIdealHeight.max
    )
  ) {
    return 'Preferred camera height must be an integer between 240 and 8,192 pixels.'
  }

  return null
}
