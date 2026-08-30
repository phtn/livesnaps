import { v } from 'convex/values'
import { IMAGE_CAPTURE_SETTINGS_KEY } from '../../src/lib/snaps/snap-settings'

const toneEventConfigValidator = v.object({
  enabled: v.boolean(),
  synthType: v.union(v.literal('basic'), v.literal('glass')),
  waveform: v.union(v.literal('sine'), v.literal('triangle'), v.literal('square'), v.literal('sawtooth')),
  notes: v.array(v.string()),
  noteDurationMs: v.number(),
  gapMs: v.number(),
  volumeDb: v.number()
})

export const captureTonesConfigValidator = v.object({
  enabled: v.boolean(),
  tones: v.object({
    error: toneEventConfigValidator,
    invalid: toneEventConfigValidator,
    good: toneEventConfigValidator
  })
})

export const shutterConfigValidator = v.object({
  enabled: v.boolean(),
  type: v.union(v.literal('dslr'), v.literal('mirrorless'), v.literal('phone'), v.literal('burst')),
  volumeDb: v.number()
})
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
