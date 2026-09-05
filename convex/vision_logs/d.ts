import { v } from 'convex/values'
import { snapCaptureIntegritySchema, snapVehicleDetailsSchema } from '../snaps/d'

export const visionLogKindSchema = v.union(v.literal('vehicle'), v.literal('odometer'), v.literal('capture_integrity'))

export const visionLogStatusSchema = v.union(v.literal('completed'), v.literal('unavailable'))

export const visionLogSchema = v.object({
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
  createdAt: v.number(),
  isDebug: v.optional(v.boolean())
})

export const visionLogDocumentSchema = visionLogSchema.extend({
  _id: v.id('vision_logs'),
  _creationTime: v.number()
})

export type VisionLog = typeof visionLogSchema.type
export type VisionLogDocument = typeof visionLogDocumentSchema.type
export type VisionLogKind = typeof visionLogKindSchema.type
