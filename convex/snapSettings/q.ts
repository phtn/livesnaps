import { DEFAULT_IMAGE_CAPTURE_SETTINGS, IMAGE_CAPTURE_SETTINGS_KEY } from '../../src/lib/snaps/snap-settings'
import { DEFAULT_SHUTTER_CONFIG, normalizeCaptureTonesConfig, normalizeShutterConfig } from '../../src/lib/tones'
import { query } from '../_generated/server'
import { captureTonesConfigValidator, shutterConfigValidator, snapSettingsResultSchema } from './d'

export const get = query({
  args: {},
  returns: snapSettingsResultSchema,
  handler: async (ctx) => {
    const settings = await ctx.db
      .query('snapSettings')
      .withIndex('by_key', (q) => q.eq('key', IMAGE_CAPTURE_SETTINGS_KEY))
      .unique()

    if (!settings) {
      return {
        ...DEFAULT_IMAGE_CAPTURE_SETTINGS,
        updatedAt: null
      }
    }

    return {
      cameraIdealHeight: settings.cameraIdealHeight,
      cameraIdealWidth: settings.cameraIdealWidth,
      imageOptimizationTimeoutMs: settings.imageOptimizationTimeoutMs,
      imageQuality: settings.imageQuality,
      maxImageDimension: settings.maxImageDimension,
      sourceJpegQuality: settings.sourceJpegQuality,
      updatedAt: settings.updatedAt
    }
  }
})

export const getCaptureTones = query({
  args: {},
  returns: captureTonesConfigValidator,
  handler: async (ctx) => {
    const doc = await ctx.db
      .query('admin')
      .withIndex('by_identifier', (q) => q.eq('identifier', 'capture-tones'))
      .first()

    if (!doc) {
      return normalizeCaptureTonesConfig(undefined)
    }

    const rawValue: unknown = doc.value.data.value

    let parsed: unknown
    try {
      parsed = JSON.parse(rawValue as string) as unknown
    } catch {
      return normalizeCaptureTonesConfig(undefined)
    }

    return normalizeCaptureTonesConfig(parsed)
  }
})

export const getShutterConfig = query({
  args: {},
  returns: shutterConfigValidator,
  handler: async (ctx) => {
    const doc = await ctx.db
      .query('admin')
      .withIndex('by_identifier', (q) => q.eq('identifier', 'shutter-config'))
      .first()

    if (!doc) {
      return normalizeShutterConfig(DEFAULT_SHUTTER_CONFIG)
    }

    const rawValue: unknown = doc.value.data.value

    let parsed: unknown
    try {
      parsed = JSON.parse(rawValue as string) as unknown
    } catch {
      return normalizeShutterConfig(DEFAULT_SHUTTER_CONFIG)
    }

    return normalizeShutterConfig(parsed)
  }
})
