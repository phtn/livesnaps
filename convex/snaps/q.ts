import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { getSnapSlot, isSnapObjectKey, isSnapUploadId, SNAP_STORAGE_PREFIX } from '../../src/lib/r2/snap-images'
import { prepareSnapLocation } from '../../src/lib/snaps/snap-location'
import { type QueryCtx, query } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { workspaceAccess } from '../lib/workspaceAccess'
import { isDraftSnap, requireOwnDraftSnap, requireSnapAccess } from '../lib/submissionAccess'
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
  handlerImageUrl: v.optional(v.string()),
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

    return snaps.filter(snap => !!snap.accountId).map((snap) => ({
      _id: snap._id,
      make: isDraftSnap(snap) ? snap.make ?? '' : '',
      model: isDraftSnap(snap) ? snap.model ?? '' : '',
      photoCount: snap.metadata.photos.length,
      plateNumber: isDraftSnap(snap) ? snap.plate_number ?? '' : '',
      startedAt: snap.location_session?.started_at ?? snap._creationTime,
      status: snap.location_session?.status ?? ('pending' as const),
      year: isDraftSnap(snap) ? snap.year ?? null : null
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

    if (!snap?.accountId || snap.metadata.applicant_token_identifier !== identity.tokenIdentifier) {
      return null
    }

    const draft = isDraftSnap(snap)
    const session = draft ? snap.location_session : undefined
    const location = draft ? snap.location : undefined

    return {
      _id: snap._id,
      address: session?.address.full_address ?? location?.address.full_address ?? '',
      bestAccuracyMeters: session?.best_accuracy_meters ?? location?.best_accuracy_meters ?? null,
      countryCodeMatchesIpinfo: session?.country_code_matches_ipinfo ?? location?.country_code_matches_ipinfo ?? null,
      createdAt: snap._creationTime,
      endedAt: snap.location_session?.ended_at ?? null,
      invalidationReason: session?.invalidation_reason ?? '',
      make: draft ? snap.make ?? '' : '',
      mileage: draft ? snap.mileage ?? null : null,
      model: draft ? snap.model ?? '' : '',
      photoCount: snap.metadata.photos.length,
      photos: (draft ? snap.metadata.photos : []).map((photo) => ({
        capturedAt: photo.captured_at,
        label: photo.label,
        size: photo.size,
        slot: photo.slot
      })),
      plateNumber: draft ? snap.plate_number ?? '' : '',
      startedAt: session?.started_at ?? snap._creationTime,
      status: snap.location_session?.status ?? ('pending' as const),
      updatedAt: snap.updated_at,
      uploadId: snap.metadata.upload_id,
      year: draft ? snap.year ?? null : null
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

    if (!snap?.accountId || snap.metadata.applicant_token_identifier !== identity.tokenIdentifier) {
      return null
    }

    await requireOwnDraftSnap(ctx, snap)
    return snap.metadata.photos.find((photo) => photo.slot === normalizedSlot.index)?.r2_key ?? null
  }
})

export const getForAdmin = query({
  args: {
    snapId: v.id('snaps')
  },
  returns: v.union(snapDocumentSchema, v.null()),
  handler: async (ctx, { snapId }) => {
    const snap = await ctx.db.get('snaps', snapId)
    if (!snap) return null
    await requireSnapAccess(ctx, snap)
    return snap
  }
})

export const getForAdminByRouteId = query({
  args: {
    snapId: v.string()
  },
  returns: v.union(snapDocumentSchema, v.null()),
  handler: async (ctx, { snapId }) => {
    const normalizedSnapId = ctx.db.normalizeId('snaps', snapId)
    const snap = normalizedSnapId ? await ctx.db.get('snaps', normalizedSnapId) : null
    if (!snap) return null
    await requireSnapAccess(ctx, snap)
    return snap
  }
})

export const getApplicantProfileForAdminBySnapId = query({
  args: {
    snapId: v.string()
  },
  returns: v.union(applicantProfileSchema, v.null()),
  handler: async (ctx, { snapId }) => {
    const normalizedSnapId = ctx.db.normalizeId('snaps', snapId)
    if (!normalizedSnapId) return null

    const anchorSnap = await ctx.db.get('snaps', normalizedSnapId)
    if (!anchorSnap) return null
    const { account: owningAccount } = await requireSnapAccess(ctx, anchorSnap)

    const applicantTokenIdentifier = anchorSnap.metadata.applicant_token_identifier
    const [snapResults, firstSnap] = applicantTokenIdentifier
      ? await Promise.all([
          ctx.db.query('snaps')
            .withIndex('by_accountId_applicant_token_identifier_session_started_at', q =>
              q.eq('accountId', owningAccount._id).eq('metadata.applicant_token_identifier', applicantTokenIdentifier))
            .order('desc').take(APPLICANT_PROFILE_SNAP_LIMIT + 1),
          ctx.db.query('snaps')
            .withIndex('by_accountId_applicant_token_identifier_session_started_at', q =>
              q.eq('accountId', owningAccount._id).eq('metadata.applicant_token_identifier', applicantTokenIdentifier))
            .order('asc').first()
        ])
      : [[anchorSnap], anchorSnap] as const
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
      account: null,
      email: latestSnap.email?.trim() || '',
      firebaseUid: latestSnap.firebase_uid?.trim() || anchorSnap.firebase_uid?.trim() || '',
      firstSeenAt: firstSnap?._creationTime ?? anchorSnap._creationTime,
      fullName: latestSnap.full_name?.trim() || '',
      hasMoreSnaps,
      knownEmails: knownValues((snap) => snap.email),
      knownFirebaseUids: knownValues((snap) => snap.firebase_uid),
      knownNames: knownValues((snap) => snap.full_name),
      knownPhones: knownValues((snap) => snap.phone),
      lastActivityAt: Math.max(...activityTimestamps),
      phone: latestSnap.phone?.trim() || '',
      snaps: summaries
    }
  }
})

async function mapSnapList(ctx: QueryCtx, snaps: Doc<'snaps'>[]): Promise<SnapListItem[]> {
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

    // A handler is stored as a name and an address rather than a reference, so
    // the avatar is resolved through the address. Addresses are not unique in
    // `users`, so the first match wins rather than throwing on a duplicate.
    const handlerEmails = [
      ...new Set(
        snaps
          .map((snap) => (snap.handler?.image_url ? undefined : snap.handler?.email))
          .filter((email): email is string => !!email)
      )
    ]
    const imageUrlByHandlerEmail = new Map<string, string | undefined>(
      await Promise.all(
        handlerEmails.map(async (email): Promise<[string, string | undefined]> => {
          const user = await ctx.db
            .query('users')
            .withIndex('by_email', (q) => q.eq('email', email))
            .first()

          return [email, user?.imageUrl]
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
        handlerImageUrl:
          snap.handler?.image_url ??
          (snap.handler?.email ? imageUrlByHandlerEmail.get(snap.handler.email) : undefined),
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

function accountSnaps(ctx: QueryCtx, accountId: Id<'accounts'>, sourceLinkId?: Id<'submissionLinks'>) {
  return sourceLinkId
    ? ctx.db.query('snaps').withIndex('by_accountId_and_submissionLinkId_and_updated_at', q =>
        q.eq('accountId', accountId).eq('submissionLinkId', sourceLinkId))
    : ctx.db.query('snaps').withIndex('by_accountId_and_updated_at', q => q.eq('accountId', accountId))
}

export const listForAdmin = query({
  args: { accountId: v.optional(v.id('accounts')), sourceLinkId: v.optional(v.id('submissionLinks')), limit: v.optional(v.number()) },
  returns: v.array(snapListItemSchema),
  handler: async (ctx, { accountId, sourceLinkId, limit }) => {
    const { account } = await workspaceAccess(ctx, accountId)
    const snaps = await accountSnaps(ctx, account._id, sourceLinkId).order('desc').take(normalizeListLimit(limit))
    return await mapSnapList(ctx, snaps)
  }
})

export const listForAccountPage = query({
  args: { accountId: v.id('accounts'), sourceLinkId: v.optional(v.id('submissionLinks')), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(snapListItemSchema),
  handler: async (ctx, { accountId, sourceLinkId, paginationOpts }) => {
    await workspaceAccess(ctx, accountId)
    const result = await accountSnaps(ctx, accountId, sourceLinkId).order('desc').paginate(paginationOpts)
    return { ...result, page: await mapSnapList(ctx, result.page) }
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

    if (!snap) throw new ConvexError('Snap not found.')
    await requireOwnDraftSnap(ctx, snap)
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
  returns: v.union(snapVehicleDetailsSchema.extend({ mileage: v.union(v.number(), v.null()) }), v.null()),
  handler: async (ctx, { upload_id }) => {
    if (!isSnapUploadId(upload_id)) {
      throw new ConvexError('Invalid snap upload ID.')
    }

    const snap = await ctx.db
      .query('snaps')
      .withIndex('by_metadata_upload_id', (query) => query.eq('metadata.upload_id', upload_id))
      .unique()

    if (!snap) return null
    const identity = await ctx.auth.getUserIdentity()
    if (!identity || snap.metadata.applicant_token_identifier !== identity.tokenIdentifier) {
      throw new ConvexError('Unauthorized.')
    }
    // The capture UI subscribes while the session is active. Completion makes
    // that subscription rerun before the client can unsubscribe; returning no
    // draft closes it cleanly without exposing any submitted contents.
    if (!isDraftSnap(snap)) return null
    await requireOwnDraftSnap(ctx, snap)
    return { plate_number: snap.plate_number ?? '', make: snap.make ?? '', model: snap.model ?? '', mileage: snap.mileage ?? null }
  }
})

export const getForAccountPhotoObjectKey = query({
  args: { snapId: v.id('snaps'), slot: v.number() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { snapId, slot }) => {
    const snap = await ctx.db.get('snaps', snapId)
    if (!snap) return null
    await requireSnapAccess(ctx, snap)
    return snap.metadata.photos.find(photo => photo.slot === slot)?.r2_key ?? null
  }
})

export const getAuthorizedPhotoObjectKey = query({
  args: { objectKey: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { objectKey }) => {
    if (!isSnapObjectKey(objectKey)) return null
    const uploadId = objectKey.slice(SNAP_STORAGE_PREFIX.length).split('/')[0]
    const snap = await ctx.db.query('snaps')
      .withIndex('by_metadata_upload_id', q => q.eq('metadata.upload_id', uploadId)).unique()
    if (!snap) return null
    await requireSnapAccess(ctx, snap)
    return snap.metadata.photos.some(photo => photo.r2_key === objectKey) ? objectKey : null
  }
})
