import { DEFAULT_IMAGE_CAPTURE_SETTINGS, IMAGE_CAPTURE_SETTINGS_KEY } from '../../src/lib/snaps/snap-settings'
import { query } from '../_generated/server'
import { reportSettingsResultSchema, snapSettingsResultSchema } from './d'

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

/** Public configuration contains only field keys, never account or operator data. */
export const getReport = query({
  args: {},
  returns: reportSettingsResultSchema,
  handler: async (ctx) => {
    const settings = await ctx.db.query('snapSettings').withIndex('by_key', q => q.eq('key', IMAGE_CAPTURE_SETTINGS_KEY)).unique()
    return { excludedFields: settings?.reportExcludedFields ?? [], updatedAt: settings?.updatedAt ?? null }
  }
})
