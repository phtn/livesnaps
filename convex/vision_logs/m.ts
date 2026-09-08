import { v } from 'convex/values'
import { internalMutation } from '../_generated/server'
import { snapCaptureIntegritySchema, snapVehicleDetailsSchema } from '../snaps/d'
import { visionLogKindSchema, visionLogStatusSchema } from './d'

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
