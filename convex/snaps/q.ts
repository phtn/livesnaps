import { ConvexError, v } from 'convex/values'
import { getSnapSlot, isSnapUploadId } from '../../src/lib/r2/snap-images'
import { prepareSnapLocation } from '../../src/lib/snaps/snap-location'
import { type QueryCtx, query } from '../_generated/server'
import {
  snapDocumentSchema,
  snapHandlerSchema,
  snapLocationSchema,
  snapLocationSessionSchema,
  snapPhotoSchema,
  snapVehicleDetailsSchema,
  snapVerificationStatusSchema
} from './d'

const DEFAULT_LIST_LIMIT = 100
const MAX_LIST_LIMIT = 250
const APPLICANT_PROFILE_SNAP_LIMIT = 100
const LATEST_SNAP_SUBMISSION_LIMIT = 3

const latestSnapSubmissionSchema = v.object({
  _id: v.id('snaps'),
  make: v.string(),
  model: v.string(),
  photoCount: v.number(),
  plateNumber: v.string(),
  startedAt: v.number(),
  status: v.union(
    v.literal('pending'),
    v.literal('active'),
    v.literal('abandoned'),
    v.literal('completed'),
    v.literal('cancelled'),
    v.literal('invalidated')
  ),
  year: v.union(v.number(), v.null())
})

const applicantSnapPhotoSchema = v.object({
  capturedAt: v.number(),
  label: v.string(),
  size: v.number(),
  slot: v.number()
})

const applicantSnapDetailSchema = latestSnapSubmissionSchema.extend({
  address: v.string(),
  bestAccuracyMeters: v.union(v.number(), v.null()),
  countryCodeMatchesIpinfo: v.union(v.boolean(), v.null()),
  createdAt: v.number(),
  endedAt: v.union(v.number(), v.null()),
  invalidationReason: v.string(),
  mileage: v.union(v.number(), v.null()),
  photos: v.array(applicantSnapPhotoSchema),
  updatedAt: v.number(),
  uploadId: v.string()
})

const snapListItemSchema = v.object({
  _id: v.id('snaps'),
  bestAccuracyMeters: v.union(v.number(), v.null()),
  countryCode: v.string(),
  countryCodeMatchesIpinfo: v.union(v.boolean(), v.null()),
  createdAt: v.number(),
  email: v.string(),
  firebaseUid: v.string(),
  fullName: v.string(),
  handler: v.optional(snapHandlerSchema),
  imageUrl: v.optional(v.string()),
  location: v.union(snapLocationSchema, v.null()),
  location_session: v.optional(snapLocationSessionSchema),
  locationLabel: v.string(),
  make: v.string(),
  mileage: v.union(v.number(), v.null()),
  model: v.string(),
  phone: v.string(),
  photos: v.array(snapPhotoSchema),
  plateNumber: v.string(),
  status: v.union(
    v.literal('pending'),
    v.literal('active'),
    v.literal('abandoned'),
    v.literal('completed'),
    v.literal('cancelled'),
    v.literal('invalidated')
  ),
  updatedAt: v.number(),
  uploadId: v.string(),
  verification_status: v.optional(snapVerificationStatusSchema),
  year: v.union(v.number(), v.null())
})

type SnapListItem = typeof snapListItemSchema.type

const applicantSnapSummarySchema = v.object({
  _id: v.id('snaps'),
  bestAccuracyMeters: v.union(v.number(), v.null()),
  countryCodeMatchesIpinfo: v.union(v.boolean(), v.null()),
  createdAt: v.number(),
  locationLabel: v.string(),
  make: v.string(),
  model: v.string(),
  photoCount: v.number(),
  photos: v.array(snapPhotoSchema),
  plateNumber: v.string(),
  status: v.union(
    v.literal('pending'),
    v.literal('active'),
    v.literal('abandoned'),
    v.literal('completed'),
    v.literal('cancelled'),
    v.literal('invalidated')
  ),
  updatedAt: v.number(),
  uploadId: v.string(),
  year: v.union(v.number(), v.null())
})

const applicantAccountSchema = v.object({
  _creationTime: v.number(),
  _id: v.id('users'),
  createdAt: v.number(),
  email: v.union(v.string(), v.null()),
  emailVerified: v.union(v.boolean(), v.null()),
  issuer: v.string(),
  name: v.union(v.string(), v.null()),
  nickname: v.union(v.string(), v.null()),
  phone: v.union(v.string(), v.null()),
  pictureUrl: v.union(v.string(), v.null()),
  preferredUsername: v.union(v.string(), v.null()),
  profileUrl: v.optional(v.string()),
  subject: v.string(),
  updatedAt: v.number()
})

const applicantProfileSchema = v.object({
  account: v.union(applicantAccountSchema, v.null()),
  email: v.string(),
  firebaseUid: v.string(),
  firstSeenAt: v.number(),
  fullName: v.string(),
  hasMoreSnaps: v.boolean(),
  knownEmails: v.array(v.string()),
  knownFirebaseUids: v.array(v.string()),
  knownNames: v.array(v.string()),
  knownPhones: v.array(v.string()),
  lastActivityAt: v.number(),
  phone: v.string(),
  snaps: v.array(applicantSnapSummarySchema)
})

type ApplicantSnapSummary = typeof applicantSnapSummarySchema.type

const requireAdmin = async (ctx: QueryCtx) => {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity || identity.admin !== true) {
    throw new ConvexError('Unauthorized.')
  }
}

const normalizeListLimit = (limit: number | undefined) => {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_LIST_LIMIT
  }

  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIST_LIMIT)
}

export const listMine = query({
  args: {},
  returns: v.array(latestSnapSubmissionSchema),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      throw new ConvexError('Sign in to view your proof submissions.')
    }

    const snaps = await ctx.db
      .query('snaps')
      .withIndex('by_applicant_token_identifier_and_session_started_at', (query) =>
        query.eq('metadata.applicant_token_identifier', identity.tokenIdentifier)
      )
      .order('desc')
      .take(LATEST_SNAP_SUBMISSION_LIMIT)

    return snaps.map((snap) => ({
      _id: snap._id,
      make: snap.make ?? '',
      model: snap.model ?? '',
      photoCount: snap.metadata.photos.length,
      plateNumber: snap.plate_number ?? '',
      startedAt: snap.location_session?.started_at ?? snap._creationTime,
      status: snap.location_session?.status ?? ('pending' as const),
      year: snap.year ?? null
    }))
  }
})

export const getMineByRouteId = query({
  args: {
    snapId: v.string()
  },
  returns: v.union(applicantSnapDetailSchema, v.null()),
  handler: async (ctx, { snapId }) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      throw new ConvexError('Sign in to view this snap submission.')
    }

    const normalizedSnapId = ctx.db.normalizeId('snaps', snapId)

    if (!normalizedSnapId) {
      return null
    }

    const snap = await ctx.db.get('snaps', normalizedSnapId)

    if (!snap || snap.metadata.applicant_token_identifier !== identity.tokenIdentifier) {
      return null
    }

    const session = snap.location_session
    const location = snap.location

    return {
      _id: snap._id,
      address: session?.address.full_address ?? location?.address.full_address ?? '',
      bestAccuracyMeters: session?.best_accuracy_meters ?? location?.best_accuracy_meters ?? null,
      countryCodeMatchesIpinfo: session?.country_code_matches_ipinfo ?? location?.country_code_matches_ipinfo ?? null,
      createdAt: snap._creationTime,
      endedAt: session?.ended_at ?? null,
      invalidationReason: session?.invalidation_reason ?? '',
      make: snap.make ?? '',
      mileage: snap.mileage ?? null,
      model: snap.model ?? '',
      photoCount: snap.metadata.photos.length,
      photos: snap.metadata.photos.map((photo) => ({
        capturedAt: photo.captured_at,
        label: photo.label,
        size: photo.size,
        slot: photo.slot
      })),
      plateNumber: snap.plate_number ?? '',
      startedAt: session?.started_at ?? snap._creationTime,
      status: session?.status ?? ('pending' as const),
      updatedAt: snap.updated_at,
      uploadId: snap.metadata.upload_id,
      year: snap.year ?? null
    }
  }
})

export const getMinePhotoObjectKey = query({
  args: {
    proofId: v.string(),
    slot: v.number()
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { proofId, slot }) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      throw new ConvexError('Sign in to view this proof photo.')
    }

    const normalizedSnapId = ctx.db.normalizeId('snaps', proofId)
    const normalizedSlot = getSnapSlot(slot)

    if (!normalizedSnapId || !normalizedSlot) {
      return null
    }

    const snap = await ctx.db.get('snaps', normalizedSnapId)

    if (!snap || snap.metadata.applicant_token_identifier !== identity.tokenIdentifier) {
      return null
    }

    return snap.metadata.photos.find((photo) => photo.slot === normalizedSlot.index)?.r2_key ?? null
  }
})

export const getForAdmin = query({
  args: {
    snapId: v.id('snaps')
  },
  returns: v.union(snapDocumentSchema, v.null()),
  handler: async (ctx, { snapId }) => {
    await requireAdmin(ctx)

    return await ctx.db.get('snaps', snapId)
  }
})

export const getForAdminByRouteId = query({
  args: {
    snapId: v.string()
  },
  returns: v.union(snapDocumentSchema, v.null()),
  handler: async (ctx, { snapId }) => {
    await requireAdmin(ctx)

    const normalizedSnapId = ctx.db.normalizeId('snaps', snapId)
    return normalizedSnapId ? await ctx.db.get('snaps', normalizedSnapId) : null
  }
})

export const getApplicantProfileForAdminBySnapId = query({
  args: {
    snapId: v.string()
  },
  returns: v.union(applicantProfileSchema, v.null()),
  handler: async (ctx, { snapId }) => {
    await requireAdmin(ctx)

    const normalizedSnapId = ctx.db.normalizeId('snaps', snapId)
    if (!normalizedSnapId) return null

    const anchorSnap = await ctx.db.get('snaps', normalizedSnapId)
    if (!anchorSnap) return null

    const applicantTokenIdentifier = anchorSnap.metadata.applicant_token_identifier
    const [snapResults, account, firstSnap] = applicantTokenIdentifier
      ? await Promise.all([
          ctx.db
            .query('snaps')
            .withIndex('by_applicant_token_identifier_and_session_started_at', (query) =>
              query.eq('metadata.applicant_token_identifier', applicantTokenIdentifier)
            )
            .order('desc')
            .take(APPLICANT_PROFILE_SNAP_LIMIT + 1),
          ctx.db
            .query('users')
            .withIndex('by_tokenIdentifier', (query) => query.eq('tokenIdentifier', applicantTokenIdentifier))
            .unique(),
          ctx.db
            .query('snaps')
            .withIndex('by_applicant_token_identifier_and_session_started_at', (query) =>
              query.eq('metadata.applicant_token_identifier', applicantTokenIdentifier)
            )
            .order('asc')
            .first()
        ])
      : ([[anchorSnap], null, anchorSnap] as const)
    const hasMoreSnaps = snapResults.length > APPLICANT_PROFILE_SNAP_LIMIT
    const applicantSnaps = snapResults.slice(0, APPLICANT_PROFILE_SNAP_LIMIT)
    const latestSnap = applicantSnaps[0] ?? anchorSnap

    const knownValues = (selectValue: (snap: (typeof applicantSnaps)[number]) => string | undefined) => [
      ...new Set(
        applicantSnaps
          .map(selectValue)
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value))
      )
    ]
    const summaries = applicantSnaps.map((snap): ApplicantSnapSummary => {
      const location = snap.location ?? (snap.location_session ? prepareSnapLocation(snap.location_session) : null)

      return {
        _id: snap._id,
        bestAccuracyMeters: location?.best_accuracy_meters ?? null,
        countryCodeMatchesIpinfo: snap.location_session
          ? snap.location_session.country_code_matches_ipinfo
          : (location?.country_code_matches_ipinfo ?? null),
        createdAt: snap._creationTime,
        locationLabel: location?.address.full_address ?? '',
        make: snap.make ?? '',
        model: snap.model ?? '',
        photoCount: snap.metadata.photos.length,
        photos: snap.metadata.photos,
        plateNumber: snap.plate_number ?? '',
        status: snap.location_session?.status ?? 'pending',
        updatedAt: snap.updated_at,
        uploadId: snap.metadata.upload_id,
        year: snap.year ?? null
      }
    })
    const activityTimestamps = applicantSnaps.flatMap((snap) => [snap._creationTime, snap.updated_at])

    return {
      account: account
        ? {
            _creationTime: account._creationTime,
            _id: account._id,
            createdAt: account.createdAt,
            email: account.email ?? null,
            emailVerified: account.emailVerified,
            issuer: account.issuer,
            name: account.name ?? null,
            nickname: account.nickname,
            phone: account.phone,
            pictureUrl: account.imageUrl ?? null,
            preferredUsername: account.preferredUsername,
            profileUrl: account.profileUrl,
            subject: account.subject,
            updatedAt: account.updatedAt
          }
        : null,
      email: latestSnap.email?.trim() || account?.email?.trim() || '',
      firebaseUid: latestSnap.firebase_uid?.trim() || anchorSnap.firebase_uid?.trim() || '',
      firstSeenAt: firstSnap?._creationTime ?? anchorSnap._creationTime,
      fullName: latestSnap.full_name?.trim() || account?.name?.trim() || '',
      hasMoreSnaps,
      knownEmails: knownValues((snap) => snap.email),
      knownFirebaseUids: knownValues((snap) => snap.firebase_uid),
      knownNames: knownValues((snap) => snap.full_name),
      knownPhones: knownValues((snap) => snap.phone),
      lastActivityAt: Math.max(...activityTimestamps),
      phone: latestSnap.phone?.trim() || account?.phone?.trim() || '',
      snaps: summaries
    }
  }
})

export const listForAdmin = query({
  args: {
    limit: v.optional(v.number())
  },
  returns: v.array(snapListItemSchema),
  handler: async (ctx, { limit }) => {
    await requireAdmin(ctx)

    const snaps = await ctx.db.query('snaps').withIndex('by_updated_at').order('desc').take(normalizeListLimit(limit))

    const firebaseUids = [...new Set(snaps.map((snap) => snap.firebase_uid).filter((uid): uid is string => !!uid))]
    const imageUrlByFirebaseUid = new Map<string, string | undefined>(
      await Promise.all(
        firebaseUids.map(async (uid): Promise<[string, string | undefined]> => {
          const user = await ctx.db
            .query('users')
            .withIndex('by_firebaseUid', (q) => q.eq('firebaseUid', uid))
            .unique()

          return [uid, user?.imageUrl]
        })
      )
    )

    return snaps.map((snap): SnapListItem => {
      const location = snap.location ?? (snap.location_session ? prepareSnapLocation(snap.location_session) : null)

      return {
        _id: snap._id,
        bestAccuracyMeters: location?.best_accuracy_meters ?? null,
        countryCode: location?.address.country_code ?? snap.ipinfo?.country_code ?? '',
        countryCodeMatchesIpinfo: snap.location_session
          ? snap.location_session.country_code_matches_ipinfo
          : (location?.country_code_matches_ipinfo ?? null),
        createdAt: snap._creationTime,
        email: snap.email ?? '',
        firebaseUid: snap.firebase_uid ?? '',
        fullName: snap.full_name ?? '',
        handler: snap.handler ?? undefined,
        imageUrl: snap.firebase_uid ? imageUrlByFirebaseUid.get(snap.firebase_uid) : undefined,
        location,
        location_session: snap.location_session,
        locationLabel: location?.address.full_address ?? '',
        make: snap.make ?? '',
        mileage: snap.mileage ?? null,
        model: snap.model ?? '',
        phone: snap.phone ?? '',
        photos: snap.metadata.photos,
        plateNumber: snap.plate_number ?? '',
        status: snap.location_session?.status ?? 'pending',
        updatedAt: snap.updated_at,
        uploadId: snap.metadata.upload_id,
        verification_status: snap.verification_status ?? undefined,
        year: snap.year ?? null
      }
    })
  }
})

export const getCaptureAnalysisState = query({
  args: {
    upload_id: v.string()
  },
  returns: v.object({
    vehicle: snapVehicleDetailsSchema
  }),
  handler: async (ctx, { upload_id }) => {
    if (!isSnapUploadId(upload_id)) {
      throw new ConvexError('Invalid proof upload ID.')
    }

    const snap = await ctx.db
      .query('snaps')
      .withIndex('by_metadata_upload_id', (query) => query.eq('metadata.upload_id', upload_id))
      .unique()

    return {
      vehicle: {
        plate_number: snap?.plate_number ?? '',
        make: snap?.make ?? '',
        model: snap?.model ?? ''
      }
    }
  }
})

export const getByUploadId = query({
  args: {
    upload_id: v.string()
  },
  returns: v.union(snapDocumentSchema, v.null()),
  handler: async (ctx, { upload_id }) => {
    if (!isSnapUploadId(upload_id)) {
      throw new ConvexError('Invalid snap upload ID.')
    }

    const snap = await ctx.db
      .query('snaps')
      .withIndex('by_metadata_upload_id', (query) => query.eq('metadata.upload_id', upload_id))
      .unique()

    return snap
  }
})
