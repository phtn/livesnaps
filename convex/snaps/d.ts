import { v } from 'convex/values'
import type { LiteData } from '../../src/lib/ipinfo/type'
import type { DeviceLocation, ReverseGeocodedAddress } from '../../src/lib/location/type'
import { CAPTURE_INTEGRITY_MODEL } from '../../src/lib/snaps/capture-integrity'
import { anyValue } from '../lib/any'

const snapIpinfoFields = {
  ip: v.string(),
  asn: v.string(),
  as_name: v.string(),
  as_domain: v.string(),
  country_code: v.string(),
  country: v.string(),
  continent_code: v.string(),
  continent: v.string()
} satisfies Record<keyof LiteData, ReturnType<typeof v.string>>

export const snapIpinfoSchema = v.object(snapIpinfoFields)

const snapDeviceLocationFields = {
  latitude: v.number(),
  longitude: v.number(),
  accuracy_meters: v.number(),
  altitude_meters: v.union(v.number(), v.null()),
  altitude_accuracy_meters: v.union(v.number(), v.null()),
  heading_degrees: v.union(v.number(), v.null()),
  speed_meters_per_second: v.union(v.number(), v.null()),
  captured_at: v.number()
} satisfies Record<
  keyof DeviceLocation,
  ReturnType<typeof v.number> | ReturnType<typeof v.null> | ReturnType<typeof v.union>
>

export const snapDeviceLocationSchema = v.object(snapDeviceLocationFields)

const snapAddressFields = {
  provider: v.literal('mapbox'),
  attribution: v.string(),
  mapbox_id: v.string(),
  feature_type: v.string(),
  full_address: v.string(),
  latitude: v.number(),
  longitude: v.number(),
  accuracy: v.optional(v.string()),
  address_number: v.optional(v.string()),
  street_name: v.optional(v.string()),
  secondary_address: v.optional(v.string()),
  secondary_designator: v.optional(v.string()),
  secondary_identifier: v.optional(v.string()),
  lot_number: v.optional(v.string()),
  neighborhood: v.optional(v.string()),
  locality: v.optional(v.string()),
  city: v.optional(v.string()),
  district: v.optional(v.string()),
  postcode: v.optional(v.string()),
  region: v.optional(v.string()),
  region_code: v.optional(v.string()),
  country: v.optional(v.string()),
  country_code: v.optional(v.string()),
  country_code_alpha_3: v.optional(v.string()),
  components: v.record(v.string(), v.string())
} satisfies Record<
  keyof ReverseGeocodedAddress,
  | ReturnType<typeof v.literal>
  | ReturnType<typeof v.string>
  | ReturnType<typeof v.number>
  | ReturnType<typeof v.optional>
  | ReturnType<typeof v.record>
>

export const snapAddressSchema = v.object(snapAddressFields)

export const snapSessionStatusSchema = v.union(
  v.literal('active'),
  v.literal('abandoned'),
  v.literal('completed'),
  v.literal('cancelled'),
  v.literal('invalidated')
)

export const snapSessionEndStatusSchema = v.union(
  v.literal('completed'),
  v.literal('cancelled'),
  v.literal('invalidated')
)

export const snapLocationSessionSchema = v.object({
  address: snapAddressSchema,
  best_accuracy_meters: v.number(),
  country_code_matches_ipinfo: v.union(v.boolean(), v.null()),
  initial: snapDeviceLocationSchema,
  latest: snapDeviceLocationSchema,
  started_at: v.number(),
  status: snapSessionStatusSchema,
  ended_at: v.optional(v.number()),
  invalidation_reason: v.optional(v.string())
})

export const snapLocationSchema = v.object({
  address: v.object({
    city: v.string(),
    country: v.string(),
    country_code: v.string(),
    country_code_alpha_3: v.string(),
    feature_type: v.string(),
    full_address: v.string(),
    latitude: v.number(),
    locality: v.string(),
    longitude: v.number(),
    mapbox_id: v.string(),
    postcode: v.string(),
    provider: v.string(),
    region: v.string(),
    street_name: v.string()
  }),
  best_accuracy_meters: v.number(),
  country_code_matches_ipinfo: v.boolean()
})

export const snapCaptureIntegritySchema = v.object({
  analyzed_at: v.number(),
  confidence: v.number(),
  disposition: v.union(v.literal('accepted'), v.literal('review'), v.literal('rejected')),
  model: v.literal(CAPTURE_INTEGRITY_MODEL),
  signals: v.array(
    v.union(
      v.literal('screen_frame_or_bezel'),
      v.literal('browser_or_gallery_ui'),
      v.literal('moire_pattern'),
      v.literal('pixel_or_subpixel_grid'),
      v.literal('scan_or_flicker_banding'),
      v.literal('display_glare_or_reflection'),
      v.literal('flat_reprojection')
    )
  ),
  status: v.union(v.literal('completed'), v.literal('unavailable')),
  verdict: v.union(v.literal('physical_scene'), v.literal('display_replay'), v.literal('uncertain'))
})

export const snapPhotoSchema = v.object({
  capture_id: v.optional(v.string()),
  capture_integrity: v.optional(snapCaptureIntegritySchema),
  captured_at: v.number(),
  content_type: v.literal('image/webp'),
  label: v.string(),
  location: v.optional(snapDeviceLocationSchema),
  r2_key: v.string(),
  size: v.number(),
  slot: v.number()
})

export const snapPhotoWriteSchema = snapPhotoSchema.extend({
  capture_integrity: snapCaptureIntegritySchema
})

export const snapVehicleDetailsSchema = v.object({
  plate_number: v.string(),
  make: v.string(),
  model: v.string()
})

export const snapMetadataSchema = v.object({
  applicant_token_identifier: v.optional(v.string()),
  attributes: v.optional(v.record(v.string(), anyValue)),
  photos: v.array(snapPhotoSchema),
  storage_prefix: v.literal('snaps/'),
  upload_id: v.string()
})

export const snapDetailsSchema = v.object({
  full_name: v.string(),
  email: v.string(),
  phone: v.string(),
  location: v.optional(snapLocationSchema),
  plate_number: v.string(),
  make: v.string(),
  model: v.string(),
  year: v.number()
})

export const snapApplicantDetailsSchema = snapDetailsSchema.omit('full_name', 'email', 'location')

export const snapHandlerSchema = v.object({
  email: v.string(),
  name: v.string()
})

export const snapVerificationStatusSchema = v.union(v.literal('draft'), v.literal('submitted'))

export const snapValidator = snapDetailsSchema.partial().extend({
  firebase_uid: v.optional(v.string()),
  handler: v.optional(snapHandlerSchema),
  ipinfo: v.optional(snapIpinfoSchema),
  location_session: v.optional(snapLocationSessionSchema),
  mileage: v.optional(v.number()),
  metadata: snapMetadataSchema,
  updated_at: v.number(),
  verification_status: v.optional(snapVerificationStatusSchema),
  video: v.optional(v.string())
})

export const snapDocumentSchema = snapValidator.extend({
  _creationTime: v.number(),
  _id: v.id('snaps')
})

export type SnapDetails = typeof snapDetailsSchema.type
export type SnapApplicantDetails = typeof snapApplicantDetailsSchema.type
export type SnapDeviceLocation = typeof snapDeviceLocationSchema.type
export type SnapIpinfo = typeof snapIpinfoSchema.type
export type SnapCaptureIntegrity = typeof snapCaptureIntegritySchema.type
export type SnapPhoto = typeof snapPhotoSchema.type
export type SnapPhotoWrite = typeof snapPhotoWriteSchema.type
export type SnapVehicleDetails = typeof snapVehicleDetailsSchema.type
export type SnapLocation = typeof snapLocationSchema.type
export type snapHandler = typeof snapHandlerSchema.type
export type snapVerificationStatus = typeof snapVerificationStatusSchema.type
