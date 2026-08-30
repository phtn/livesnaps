import { ConvexError, v } from 'convex/values'
import {
  DEFAULT_IMAGE_CAPTURE_SETTINGS,
  getSnapSettingsValidationError,
  IMAGE_CAPTURE_SETTINGS_KEY,
  type ImageCaptureSettingsValues
} from '../../src/lib/snaps/snap-settings'
import { internalMutation, mutation, type MutationCtx } from '../_generated/server'
import {
  captureTonesConfigValidator,
  shutterConfigValidator,
  snapSettingsResultSchema,
  snapSettingsValuesSchema
} from './d'

const getSettingsDocument = async (ctx: MutationCtx) =>
  await ctx.db
    .query('snapSettings')
    .withIndex('by_key', (q) => q.eq('key', IMAGE_CAPTURE_SETTINGS_KEY))
    .unique()

const validateSettings = (settings: ImageCaptureSettingsValues) => {
  const validationError = getSnapSettingsValidationError(settings)

  if (validationError) {
    throw new ConvexError(validationError)
  }
}

export const update = mutation({
  args: snapSettingsValuesSchema,
  returns: snapSettingsResultSchema,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity || identity.admin !== true) {
      throw new ConvexError('Unauthorized.')
    }

    validateSettings(args)

    const existing = await getSettingsDocument(ctx)
    const updatedAt = Date.now()
    const settings = {
      cameraIdealHeight: args.cameraIdealHeight,
      cameraIdealWidth: args.cameraIdealWidth,
      imageOptimizationTimeoutMs: args.imageOptimizationTimeoutMs,
      imageQuality: args.imageQuality,
      maxImageDimension: args.maxImageDimension,
      sourceJpegQuality: args.sourceJpegQuality
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...settings,
        updatedAt,
        updatedBy: identity.tokenIdentifier
      })
    } else {
      await ctx.db.insert('snapSettings', {
        ...settings,
        key: IMAGE_CAPTURE_SETTINGS_KEY,
        createdAt: updatedAt,
        updatedAt,
        updatedBy: identity.tokenIdentifier
      })
    }

    return {
      ...settings,
      updatedAt
    }
  }
})

const getAdminDocumentByIdentifier = async (db: MutationCtx['db'], identifier: string) =>
  await db
    .query('admin')
    .withIndex('by_identifier', (q) => q.eq('identifier', identifier))
    .first()

const upsertAdminValue = async (ctx: MutationCtx, identifier: string, payload: unknown) => {
  const existing = await getAdminDocumentByIdentifier(ctx.db, identifier)
  const now = Date.now()
  const value = {
    type: 'json',
    data: {
      key: identifier,
      value: JSON.stringify(payload, null, 2)
    },
    updatedAt: now
  }

  if (existing) {
    await ctx.db.patch(existing._id, { value })
    return now
  }

  await ctx.db.insert('admin', {
    identifier,
    value
  })
  return now
}

const CAPTURE_TONES_IDENTIFIER = 'capture-tones'
const SHUTTER_CONFIG_IDENTIFIER = 'shutter-config'

export const upsertCaptureTonesConfig = mutation({
  args: {
    config: captureTonesConfigValidator
  },
  returns: v.object({ updatedAt: v.number() }),
  handler: async (ctx, { config }) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity || identity.admin !== true) {
      throw new ConvexError('Unauthorized.')
    }

    const updatedAt = await upsertAdminValue(ctx, CAPTURE_TONES_IDENTIFIER, config)

    return { updatedAt }
  }
})

export const upsertShutterConfig = mutation({
  args: {
    config: shutterConfigValidator
  },
  returns: v.object({ updatedAt: v.number() }),
  handler: async (ctx, { config }) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity || identity.admin !== true) {
      throw new ConvexError('Unauthorized.')
    }

    const updatedAt = await upsertAdminValue(ctx, SHUTTER_CONFIG_IDENTIFIER, config)

    return { updatedAt }
  }
})

export const seedDefaults = internalMutation({
  args: {},
  returns: v.object({
    created: v.boolean(),
    settings: snapSettingsResultSchema
  }),
  handler: async (ctx) => {
    const existing = await getSettingsDocument(ctx)

    if (existing) {
      return {
        created: false,
        settings: {
          cameraIdealHeight: existing.cameraIdealHeight,
          cameraIdealWidth: existing.cameraIdealWidth,
          imageOptimizationTimeoutMs: existing.imageOptimizationTimeoutMs,
          imageQuality: existing.imageQuality,
          maxImageDimension: existing.maxImageDimension,
          sourceJpegQuality: existing.sourceJpegQuality,
          updatedAt: existing.updatedAt
        }
      }
    }

    const updatedAt = Date.now()

    await ctx.db.insert('snapSettings', {
      ...DEFAULT_IMAGE_CAPTURE_SETTINGS,
      key: IMAGE_CAPTURE_SETTINGS_KEY,
      createdAt: updatedAt,
      updatedAt,
      updatedBy: 'seed'
    })

    return {
      created: true,
      settings: {
        ...DEFAULT_IMAGE_CAPTURE_SETTINGS,
        updatedAt
      }
    }
  }
})
