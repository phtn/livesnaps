import { ConvexError, v } from 'convex/values'
import {
  type DeviceLocation,
  isSnapLocationCurrentAndAccurate,
  MAX_SNAP_LOCATION_ACCURACY_METERS,
  MAX_SNAP_LOCATION_AGE_MS,
  parseDeviceLocation
} from '../../src/lib/location/type'
import {
  buildSnapObjectKey,
  getSnapSlot,
  isSnapCaptureId,
  isSnapUploadId,
  SNAP_IMAGE_MAX_BYTES,
  SNAP_SLOTS,
  SNAP_STORAGE_PREFIX
} from '../../src/lib/r2/snap-images'
import { resolveSnapApplicant, type SnapApplicant } from '../../src/lib/snaps/applicant'
import { isCaptureIntegrityAnalysisPersistable } from '../../src/lib/snaps/capture-integrity'
import { normalizeMileage } from '../../src/lib/snaps/odometer'
import { updateSnapPhotos } from '../../src/lib/snaps/photo-state'
import { prepareSnapLocation } from '../../src/lib/snaps/snap-location'
import {
  MAX_PLATE_NUMBER_LENGTH,
  normalizeDetectedVehicleDetails,
  normalizePlateNumber
} from '../../src/lib/snaps/vehicle-details'
import { internalMutation, type MutationCtx, mutation } from '../_generated/server'
import {
  type SnapApplicantDetails,
  type SnapCaptureIntegrity,
  type SnapDetails,
  type SnapPhoto,
  type SnapVehicleDetails,
  snapAddressSchema,
  snapApplicantDetailsSchema,
  snapCaptureIntegritySchema,
  snapDeviceLocationSchema,
  snapIpinfoSchema,
  snapPhotoSchema,
  snapPhotoWriteSchema,
  snapSessionEndStatusSchema,
  snapVehicleDetailsSchema
} from './d'

const SNAP_SESSION_REUSE_WINDOW_MS = 60 * 60 * 1000
const SNAP_SESSION_ABANDON_AFTER_MS = 60 * 60 * 1000
const SNAP_SESSION_ABANDON_BATCH_SIZE = 500

const normalizeRequiredString = (value: string, fieldName: string) => {
  const normalized = value.trim()

  if (!normalized) {
    throw new ConvexError(`${fieldName} is required.`)
  }

  return normalized
}

const normalizeDetails = (details: SnapApplicantDetails, applicant: SnapApplicant): Omit<SnapDetails, 'location'> => {
  if (!Number.isSafeInteger(details.year) || details.year < 1886 || details.year > new Date().getFullYear() + 1) {
    throw new ConvexError('Year must be a valid vehicle model year.')
  }

  return {
    full_name: applicant.fullName,
    email: applicant.email,
    phone: normalizeRequiredString(details.phone, 'Phone'),
    plate_number: normalizeRequiredString(details.plate_number, 'Plate number').toUpperCase(),
    make: normalizeRequiredString(details.make, 'Make'),
    model: normalizeRequiredString(details.model, 'Model'),
    year: details.year
  }
}

const requireSnapApplicant = async (ctx: MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity()

  try {
    return resolveSnapApplicant(identity)
  } catch (error) {
    throw new ConvexError(error instanceof Error ? error.message : 'Applicant identity is invalid.')
  }
}

const normalizeCaptureIntegrity = (
  captureIntegrity: SnapCaptureIntegrity,
  capturedAt: number
): SnapCaptureIntegrity => {
  if (!isCaptureIntegrityAnalysisPersistable(captureIntegrity, capturedAt)) {
    throw new ConvexError('Snap capture integrity metadata is invalid.')
  }

  return captureIntegrity
}

const normalizePhoto = (uploadId: string, photo: SnapPhoto): SnapPhoto => {
  const slot = getSnapSlot(photo.slot)
  const captureId = photo.capture_id

  if (!slot) {
    throw new ConvexError('Invalid proof photo slot.')
  }

  if (
    !captureId ||
    !isSnapCaptureId(captureId) ||
    photo.r2_key !== buildSnapObjectKey(uploadId, slot.index, captureId) ||
    photo.label !== slot.label ||
    photo.content_type !== 'image/webp'
  ) {
    throw new ConvexError('Proof photo metadata does not match its storage slot.')
  }

  if (!Number.isSafeInteger(photo.size) || photo.size < 1 || photo.size > SNAP_IMAGE_MAX_BYTES) {
    throw new ConvexError('Proof photo size is invalid.')
  }

  if (
    !Number.isFinite(photo.captured_at) ||
    photo.captured_at <= 0 ||
    photo.captured_at > Date.now() + 5_000 ||
    Date.now() - photo.captured_at > 120_000
  ) {
    throw new ConvexError('Proof capture time is invalid.')
  }

  const { capture_integrity: captureIntegrity, ...photoMetadata } = photo

  return {
    ...photoMetadata,
    ...(captureIntegrity ? { capture_integrity: normalizeCaptureIntegrity(captureIntegrity, photo.captured_at) } : {}),
    slot: slot.index
  }
}

const normalizeDeviceLocation = (value: DeviceLocation) => {
  const location = parseDeviceLocation(value)

  if (!location) {
    throw new ConvexError('Device location is invalid.')
  }

  return location
}

const normalizeVehicleDetails = (details: SnapVehicleDetails) => normalizeDetectedVehicleDetails(details)

const prepareVehicleDetailsPatch = (details: SnapVehicleDetails) => {
  const normalized = normalizeVehicleDetails(details)

  return {
    ...(normalized.plate_number ? { plate_number: normalized.plate_number } : {}),
    ...(normalized.make ? { make: normalized.make } : {}),
    ...(normalized.model ? { model: normalized.model } : {})
  }
}

const normalizeConfirmedPlateNumber = (value: string) => {
  const normalized = normalizePlateNumber(value)

  if (!normalized) {
    throw new ConvexError('Confirm the vehicle plate number before completing verification.')
  }

  if (value.trim().replace(/\s+/g, ' ').length > MAX_PLATE_NUMBER_LENGTH) {
    throw new ConvexError(`Plate number must be ${MAX_PLATE_NUMBER_LENGTH} characters or fewer.`)
  }

  return normalized
}

export const startSession = mutation({
  args: {
    address: snapAddressSchema,
    initial_location: snapDeviceLocationSchema,
    ipinfo: snapIpinfoSchema,
    upload_id: v.string()
  },
  returns: v.id('snaps'),
  handler: async (ctx, { address, initial_location, ipinfo, upload_id }) => {
    const applicant = await requireSnapApplicant(ctx)

    if (!isSnapUploadId(upload_id)) {
      throw new ConvexError('Invalid proof upload ID.')
    }

    const initialLocation = normalizeDeviceLocation(initial_location)

    if (!isSnapLocationCurrentAndAccurate(initialLocation)) {
      throw new ConvexError(
        `Location accuracy must be ${MAX_SNAP_LOCATION_ACCURACY_METERS} meters or better when verification starts.`
      )
    }

    const snapWithUploadId = await ctx.db
      .query('snaps')
      .withIndex('by_metadata_upload_id', (query) => query.eq('metadata.upload_id', upload_id))
      .unique()

    if (snapWithUploadId) {
      const belongsToApplicant = snapWithUploadId.metadata.applicant_token_identifier === applicant.tokenIdentifier

      if (!belongsToApplicant) {
        throw new ConvexError('This proof verification session already exists.')
      }

      if (!snapWithUploadId.firebase_uid) {
        await ctx.db.patch('snaps', snapWithUploadId._id, { firebase_uid: applicant.firebaseUid })
      }

      return snapWithUploadId._id
    }

    const startedAt = Date.now()
    const recentSnap = await ctx.db
      .query('snaps')
      .withIndex('by_applicant_token_identifier_and_session_started_at', (query) =>
        query
          .eq('metadata.applicant_token_identifier', applicant.tokenIdentifier)
          .gte('location_session.started_at', startedAt - SNAP_SESSION_REUSE_WINDOW_MS)
      )
      .order('desc')
      .first()
    const addressCountryCode = address.country_code?.trim().toUpperCase()
    const locationSession = {
      address,
      best_accuracy_meters: initialLocation.accuracy_meters,
      country_code_matches_ipinfo: addressCountryCode
        ? addressCountryCode === ipinfo.country_code.trim().toUpperCase()
        : null,
      initial: initialLocation,
      latest: initialLocation,
      started_at: startedAt,
      status: 'active' as const
    }
    const sessionSnap = {
      email: applicant.email,
      firebase_uid: applicant.firebaseUid,
      full_name: applicant.fullName,
      ipinfo,
      location: prepareSnapLocation(locationSession),
      location_session: locationSession,
      metadata: {
        ...(recentSnap?.metadata.attributes ? { attributes: recentSnap.metadata.attributes } : {}),
        applicant_token_identifier: applicant.tokenIdentifier,
        photos: [],
        storage_prefix: SNAP_STORAGE_PREFIX,
        upload_id
      },
      updated_at: startedAt
    }

    if (recentSnap) {
      await ctx.db.patch('snaps', recentSnap._id, {
        ...sessionSnap,
        make: undefined,
        mileage: undefined,
        model: undefined,
        phone: undefined,
        plate_number: undefined,
        video: undefined,
        year: undefined
      })
      return recentSnap._id
    }

    return await ctx.db.insert('snaps', sessionSnap)
  }
})

const savePhotoArgs = {
  is_retake: v.boolean(),
  location: snapDeviceLocationSchema,
  mileage: v.optional(v.number()),
  upload_id: v.string(),
  vehicle: v.optional(snapVehicleDetailsSchema)
}

const savePhotoHandler = async (
  ctx: MutationCtx,
  {
    is_retake,
    location,
    mileage,
    photo,
    upload_id,
    vehicle
  }: {
    is_retake: boolean
    location: DeviceLocation
    mileage?: number
    photo: SnapPhoto
    upload_id: string
    vehicle?: SnapVehicleDetails
  }
) => {
  if (!isSnapUploadId(upload_id)) {
    throw new ConvexError('Invalid proof upload ID.')
  }

  const normalizedLocation = normalizeDeviceLocation(location)
  const normalizedPhoto = normalizePhoto(upload_id, { ...photo, location: normalizedLocation })

  if (
    normalizedLocation.accuracy_meters > MAX_SNAP_LOCATION_ACCURACY_METERS ||
    Math.abs(normalizedPhoto.captured_at - normalizedLocation.captured_at) > MAX_SNAP_LOCATION_AGE_MS
  ) {
    throw new ConvexError('A fresh, precise device location is required for every proof photo.')
  }

  const existingProof = await ctx.db
    .query('snaps')
    .withIndex('by_metadata_upload_id', (query) => query.eq('metadata.upload_id', upload_id))
    .unique()
  const updated_at = Date.now()

  if (!existingProof?.location_session) {
    throw new ConvexError('Start a location-verified proof session before capturing photos.')
  }

  if (existingProof.location_session.status !== 'active') {
    throw new ConvexError('This proof verification session is no longer active.')
  }

  const photoUpdate = updateSnapPhotos(existingProof.metadata.photos, normalizedPhoto, is_retake)

  if (photoUpdate.status !== 'updated') {
    if (photoUpdate.status === 'occupied_without_retake') {
      throw new ConvexError('This proof photo slot is already occupied. Retake it to replace the current photo.')
    }

    throw new ConvexError('Cannot retake a proof photo that does not exist.')
  }

  if (vehicle && normalizedPhoto.slot !== 1 && normalizedPhoto.slot !== 2) {
    throw new ConvexError('Vehicle details can only be extracted from the front or back photo.')
  }

  if (mileage !== undefined && normalizedPhoto.slot !== 5) {
    throw new ConvexError('Mileage can only be extracted from the odometer photo.')
  }

  const normalizedMileage = mileage === undefined ? null : normalizeMileage(mileage)

  if (mileage !== undefined && normalizedMileage === null) {
    throw new ConvexError('The detected mileage is invalid.')
  }

  const locationSession = {
    ...existingProof.location_session,
    best_accuracy_meters: Math.min(
      existingProof.location_session.best_accuracy_meters,
      normalizedLocation.accuracy_meters
    ),
    latest: normalizedLocation
  }

  await ctx.db.patch(existingProof._id, {
    ...(vehicle ? prepareVehicleDetailsPatch(vehicle) : {}),
    ...(normalizedMileage !== null ? { mileage: normalizedMileage } : {}),
    location: prepareSnapLocation(locationSession),
    location_session: locationSession,
    metadata: {
      ...existingProof.metadata,
      photos: photoUpdate.photos
    },
    updated_at
  })

  return existingProof._id
}

/**
 * Compatibility writer for clients deployed before capture-integrity analysis.
 * Retire after every active web deployment writes through savePhotoWithCaptureIntegrity.
 */
export const savePhoto = mutation({
  args: {
    ...savePhotoArgs,
    photo: snapPhotoSchema
  },
  returns: v.id('snaps'),
  handler: savePhotoHandler
})

export const savePhotoWithCaptureIntegrity = mutation({
  args: {
    ...savePhotoArgs,
    photo: snapPhotoWriteSchema
  },
  returns: v.id('snaps'),
  handler: savePhotoHandler
})

export const patchCapturedPhotoVision = mutation({
  args: {
    capture_id: v.string(),
    capture_integrity: snapCaptureIntegritySchema,
    mileage: v.optional(v.number()),
    upload_id: v.string(),
    vehicle: v.optional(snapVehicleDetailsSchema)
  },
  returns: v.id('snaps'),
  handler: async (ctx, { capture_id, capture_integrity, mileage, upload_id, vehicle }) => {
    if (!isSnapUploadId(upload_id)) {
      throw new ConvexError('Invalid proof upload ID.')
    }

    if (!isSnapCaptureId(capture_id)) {
      throw new ConvexError('Invalid proof capture ID.')
    }

    const captureIntegrity = normalizeCaptureIntegrity(capture_integrity, capture_integrity.analyzed_at)

    const snap = await ctx.db
      .query('snaps')
      .withIndex('by_metadata_upload_id', (query) => query.eq('metadata.upload_id', upload_id))
      .unique()

    if (!snap) {
      throw new ConvexError('Proof verification session not found.')
    }

    const photoIndex = snap.metadata.photos.findIndex((photo) => photo.capture_id === capture_id)

    if (photoIndex === -1) {
      throw new ConvexError('Captured photo not found for vision update.')
    }

    const existingPhoto = snap.metadata.photos[photoIndex]

    if (vehicle && existingPhoto.slot !== 1 && existingPhoto.slot !== 2) {
      throw new ConvexError('Vehicle details can only be extracted from the front or back photo.')
    }

    if (mileage !== undefined && existingPhoto.slot !== 5) {
      throw new ConvexError('Mileage can only be extracted from the odometer photo.')
    }

    const normalizedMileage = mileage === undefined ? null : normalizeMileage(mileage)

    if (mileage !== undefined && normalizedMileage === null) {
      throw new ConvexError('The detected mileage is invalid.')
    }

    const updatedPhoto: SnapPhoto = {
      ...existingPhoto,
      capture_integrity: captureIntegrity
    }

    const updatedPhotos = [...snap.metadata.photos]
    updatedPhotos[photoIndex] = updatedPhoto

    await ctx.db.patch(snap._id, {
      ...(vehicle ? prepareVehicleDetailsPatch(vehicle) : {}),
      ...(normalizedMileage !== null ? { mileage: normalizedMileage } : {}),
      metadata: {
        ...snap.metadata,
        photos: updatedPhotos
      },
      updated_at: Date.now()
    })

    return snap._id
  }
})

export const endSession = mutation({
  args: {
    last_location: v.optional(snapDeviceLocationSchema),
    plate_number: v.optional(v.string()),
    reason: v.optional(v.string()),
    status: snapSessionEndStatusSchema,
    upload_id: v.string()
  },
  returns: v.id('snaps'),
  handler: async (ctx, { last_location, plate_number, reason, status, upload_id }) => {
    if (!isSnapUploadId(upload_id)) {
      throw new ConvexError('Invalid proof session update.')
    }

    const snap = await ctx.db
      .query('snaps')
      .withIndex('by_metadata_upload_id', (query) => query.eq('metadata.upload_id', upload_id))
      .unique()

    if (!snap?.location_session) {
      throw new ConvexError('snap verification session not found.')
    }

    if (snap.location_session.status !== 'active') {
      return snap._id
    }

    const lastLocation = last_location ? normalizeDeviceLocation(last_location) : snap.location_session.latest

    if (
      status === 'completed' &&
      (snap.metadata.photos.length !== SNAP_SLOTS.length ||
        lastLocation.accuracy_meters > MAX_SNAP_LOCATION_ACCURACY_METERS)
    ) {
      throw new ConvexError('All proof photos and a precise final location are required to complete verification.')
    }

    const confirmedPlateNumber = status === 'completed' ? normalizeConfirmedPlateNumber(plate_number ?? '') : null

    const invalidationReason = reason?.trim()

    if (status === 'invalidated' && !invalidationReason) {
      throw new ConvexError('A location invalidation reason is required.')
    }

    const endedAt = Date.now()
    const locationSession = {
      ...snap.location_session,
      best_accuracy_meters: Math.min(snap.location_session.best_accuracy_meters, lastLocation.accuracy_meters),
      latest: lastLocation,
      status,
      ended_at: endedAt,
      ...(status === 'invalidated' ? { invalidation_reason: invalidationReason!.slice(0, 500) } : {})
    }

    await ctx.db.patch(snap._id, {
      ...(confirmedPlateNumber ? { plate_number: confirmedPlateNumber } : {}),
      location: prepareSnapLocation(locationSession),
      location_session: locationSession,
      updated_at: endedAt
    })

    return snap._id
  }
})

export const abandonExpiredSessions = internalMutation({
  args: {},
  returns: v.object({
    abandoned: v.number(),
    checked: v.number()
  }),
  handler: async (ctx) => {
    const now = Date.now()
    const cutoff = now - SNAP_SESSION_ABANDON_AFTER_MS
    const proofs = await ctx.db
      .query('snaps')
      .withIndex('by_location_session_status_and_started_at', (query) =>
        query.eq('location_session.status', 'active').lte('location_session.started_at', cutoff)
      )
      .order('asc')
      .take(SNAP_SESSION_ABANDON_BATCH_SIZE)
    let abandoned = 0

    for (const proof of proofs) {
      const session = proof.location_session

      if (!session || session.status !== 'active' || session.started_at > cutoff) {
        continue
      }

      await ctx.db.patch(proof._id, {
        location_session: {
          ...session,
          ended_at: session.started_at + SNAP_SESSION_ABANDON_AFTER_MS,
          status: 'abandoned'
        },
        updated_at: now
      })
      abandoned += 1
    }

    return { abandoned, checked: proofs.length }
  }
})

export const updateDetails = mutation({
  args: {
    details: snapApplicantDetailsSchema,
    SNAP_id: v.id('snaps')
  },
  returns: v.id('snaps'),
  handler: async (ctx, { details, SNAP_id }) => {
    const applicant = await requireSnapApplicant(ctx)
    const snap = await ctx.db.get(SNAP_id)

    if (!snap) {
      throw new ConvexError('snap not found.')
    }

    if (snap.metadata.applicant_token_identifier !== applicant.tokenIdentifier) {
      throw new ConvexError('Unauthorized.')
    }

    if (snap.location_session && snap.location_session.status !== 'active') {
      throw new ConvexError('Cannot edit a completed snap — only active sessions can be overwritten.')
    }

    await ctx.db.patch(SNAP_id, {
      ...normalizeDetails(details, applicant),
      updated_at: Date.now()
    })

    return SNAP_id
  }
})
