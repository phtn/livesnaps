import { v } from 'convex/values'
import { IMAGE_CAPTURE_SETTINGS_KEY } from '../../src/lib/snaps/snap-settings'

export const snapSettingsValuesSchema = v.object({
  cameraIdealHeight: v.number(),
  cameraIdealWidth: v.number(),
  imageOptimizationTimeoutMs: v.number(),
  imageQuality: v.number(),
  maxImageDimension: v.number(),
  sourceJpegQuality: v.number()
})

export const snapSettingsSchema = snapSettingsValuesSchema.extend({
  key: v.literal(IMAGE_CAPTURE_SETTINGS_KEY),
  createdAt: v.number(),
  updatedAt: v.number(),
  updatedBy: v.string()
})

export const snapSettingsDocumentSchema = snapSettingsSchema.extend({
  _id: v.id('snapSettings'),
  _creationTime: v.number()
})

export const snapSettingsResultSchema = snapSettingsValuesSchema.extend({
  updatedAt: v.union(v.number(), v.null())
})

export type SnapSettings = typeof snapSettingsSchema.type
export type SnapSettingsResult = typeof snapSettingsResultSchema.type
