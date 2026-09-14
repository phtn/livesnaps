import { ConvexError, v } from 'convex/values'
import { isSnapUploadId } from '../../src/lib/r2/snap-images'
import { normalizeDetectedVehicleDetails, normalizePlateNumber } from '../../src/lib/snaps/vehicle-details'
import type { Doc } from '../_generated/dataModel'
import { internalMutation, type MutationCtx, mutation } from '../_generated/server'
import { isDraftSnap, requireOwnDraftSnap, requireOwnReadableSnap } from '../lib/submissionAccess'
import { snapCaptureIntegritySchema, snapVehicleDetailsSchema } from '../snaps/d'
import { visionLogKindSchema, visionLogStatusSchema } from './d'

const captureVehicleVisionJobSchema = v.object({
  capture_id: v.string(),
  log_id: v.id('vision_logs'),
  r2_key: v.string(),
  slot: v.union(v.literal(1), v.literal(2))
})

type CaptureVehicleVisionJob = typeof captureVehicleVisionJobSchema.type

const visionLogArgs = {
  upload_id: v.string(),
  slot: v.number(),
  slotLabel: v.optional(v.string()),
  kind: visionLogKindSchema,
  status: visionLogStatusSchema,
  provider: v.string(),
  model: v.string(),
  r2_key: v.string(),
  capture_id: v.optional(v.string()),
  vehicle: v.optional(snapVehicleDetailsSchema),
  mileage: v.optional(v.union(v.number(), v.null())),
  captureIntegrity: v.optional(snapCaptureIntegritySchema),
  visionStatus: v.optional(v.string()),
  rawOutput: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  isDebug: v.optional(v.boolean())
}

export const log = internalMutation({
  args: visionLogArgs,
  returns: v.id('vision_logs'),
  handler: async (ctx, args) => {
    return await ctx.db.insert('vision_logs', {
      ...args,
      createdAt: Date.now()
    })
  }
})

export const logPublic = internalMutation({
  args: visionLogArgs,
  returns: v.id('vision_logs'),
  handler: async (ctx, args) => {
    // Debug logs are server-only; an upload ID never authorizes a public write.
    return await ctx.db.insert('vision_logs', {
      ...args,
      createdAt: Date.now()
    })
  }
})

const getSnapByUploadId = async (ctx: MutationCtx, uploadId: string) =>
  await ctx.db
    .query('snaps')
    .withIndex('by_metadata_upload_id', (query) => query.eq('metadata.upload_id', uploadId))
    .unique()

const insertCaptureVehicleVisionJob = async (
  ctx: MutationCtx,
  input: {
    captureId: string
    model: string
    provider: string
    r2Key: string
    slot: 1 | 2
    slotLabel: string
    uploadId: string
  }
): Promise<CaptureVehicleVisionJob> => {
  const logId = await ctx.db.insert('vision_logs', {
    capture_id: input.captureId,
    createdAt: Date.now(),
    kind: 'vehicle',
    model: input.model,
    provider: input.provider,
    r2_key: input.r2Key,
    slot: input.slot,
    slotLabel: input.slotLabel,
    status: 'processing',
    upload_id: input.uploadId
  })

  return {
    capture_id: input.captureId,
    log_id: logId,
    r2_key: input.r2Key,
    slot: input.slot
  }
}

/**
 * Atomically claims the next vehicle image for a capture session.
 * Front is always attempted first. Back becomes eligible only after the current
 * front attempt completed without a plate or was unavailable.
 */
export const claimCaptureVehicleVision = mutation({
  args: {
    model: v.string(),
    provider: v.string(),
    upload_id: v.string()
  },
  returns: v.union(captureVehicleVisionJobSchema, v.null()),
  handler: async (ctx, { model, provider, upload_id }) => {
    if (!isSnapUploadId(upload_id)) throw new ConvexError('Invalid proof upload ID.')

    const normalizedModel = model.trim()
    const normalizedProvider = provider.trim()
    if (!normalizedModel || !normalizedProvider) throw new ConvexError('Vision provider configuration is invalid.')

    const snap = await getSnapByUploadId(ctx, upload_id)
    if (!snap) throw new ConvexError('Proof verification session not found.')
    await requireOwnDraftSnap(ctx, snap)

    const front = snap.metadata.photos.find((photo) => photo.slot === 1)
    if (!front?.capture_id) return null

    const back = snap.metadata.photos.find((photo) => photo.slot === 2)
    const logs = await ctx.db
      .query('vision_logs')
      .withIndex('by_upload_id', (query) => query.eq('upload_id', upload_id))
      .order('desc')
      .take(50)
    const vehicleLogs = logs.filter((log) => log.kind === 'vehicle')
    const frontLog = vehicleLogs.find((log) => log.slot === 1 && log.capture_id === front.capture_id)

    if (!frontLog) {
      if (vehicleLogs.length > 0) {
        await ctx.db.patch(snap._id, {
          make: undefined,
          model: undefined,
          plate_number: undefined,
          updated_at: Date.now()
        })
      }

      return await insertCaptureVehicleVisionJob(ctx, {
        captureId: front.capture_id,
        model: normalizedModel,
        provider: normalizedProvider,
        r2Key: front.r2_key,
        slot: 1,
        slotLabel: front.label,
        uploadId: upload_id
      })
    }

    if (frontLog.status === 'processing' || normalizePlateNumber(frontLog.vehicle?.plate_number)) {
      return null
    }

    if (!back?.capture_id) return null

    const backLog = vehicleLogs.find((log) => log.slot === 2 && log.capture_id === back.capture_id)
    if (backLog) return null

    if (snap.plate_number) {
      await ctx.db.patch(snap._id, { plate_number: undefined, updated_at: Date.now() })
    }

    return await insertCaptureVehicleVisionJob(ctx, {
      captureId: back.capture_id,
      model: normalizedModel,
      provider: normalizedProvider,
      r2Key: back.r2_key,
      slot: 2,
      slotLabel: back.label,
      uploadId: upload_id
    })
  }
})

/** Completes one claimed image without ever changing capture-session status. */
export const completeCaptureVehicleVision = mutation({
  args: {
    errorMessage: v.optional(v.string()),
    log_id: v.id('vision_logs'),
    rawOutput: v.optional(v.string()),
    status: v.union(v.literal('completed'), v.literal('unavailable')),
    vehicle: v.optional(snapVehicleDetailsSchema)
  },
  returns: v.null(),
  handler: async (ctx, { errorMessage, log_id, rawOutput, status, vehicle }) => {
    const log = await ctx.db.get('vision_logs', log_id)
    if (log?.kind !== 'vehicle' || log.status !== 'processing') return null

    const snap = await getSnapByUploadId(ctx, log.upload_id)
    if (!snap) return null
    await requireOwnReadableSnap(ctx, snap)

    const currentPhoto = snap.metadata.photos.find(
      (photo) => photo.slot === log.slot && photo.capture_id === log.capture_id && photo.r2_key === log.r2_key
    )

    if (!currentPhoto) {
      await ctx.db.patch('vision_logs', log_id, {
        errorMessage: 'The capture slot was replaced before Vision completed.',
        status: 'unavailable'
      })
      return null
    }

    const normalizedVehicle = normalizeDetectedVehicleDetails(vehicle)
    await ctx.db.patch('vision_logs', log_id, {
      errorMessage: errorMessage?.trim().slice(0, 500) || undefined,
      rawOutput: rawOutput?.slice(0, 10_000) || undefined,
      status,
      vehicle: status === 'completed' ? normalizedVehicle : undefined
    })

    if (status !== 'completed' || !isDraftSnap(snap)) return null

    const vehiclePatch: Partial<Pick<Doc<'snaps'>, 'make' | 'model' | 'plate_number'>> =
      log.slot === 1
        ? {
            ...(normalizedVehicle.make ? { make: normalizedVehicle.make } : {}),
            ...(normalizedVehicle.model ? { model: normalizedVehicle.model } : {}),
            ...(normalizedVehicle.plate_number ? { plate_number: normalizedVehicle.plate_number } : {})
          }
        : normalizedVehicle.plate_number
          ? { plate_number: normalizedVehicle.plate_number }
          : {}

    if (Object.keys(vehiclePatch).length > 0) {
      await ctx.db.patch(snap._id, { ...vehiclePatch, updated_at: Date.now() })
    }

    return null
  }
})
