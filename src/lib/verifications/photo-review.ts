import type { SnapPhoto } from '../../../convex/snaps/d'

export interface PhotoReviewDecision {
  photoKey: string
  status: 'verified' | 'skipped'
}

// Explicit tuples make the snapshot independent of JSON object property order.
// Include capture evidence, so a changed photo or changed evidence requires review again.
export const photoReviewSnapshot = (photos: readonly SnapPhoto[]) => JSON.stringify(
  [...photos].sort((a, b) => a.slot - b.slot).map(photo => [
    photo.r2_key, photo.capture_id ?? null, photo.slot, photo.label, photo.captured_at, photo.size, photo.content_type,
    photo.location ? [photo.location.latitude, photo.location.longitude, photo.location.accuracy_meters,
      photo.location.altitude_meters, photo.location.altitude_accuracy_meters, photo.location.heading_degrees,
      photo.location.speed_meters_per_second, photo.location.captured_at] : null,
    photo.capture_integrity ? [photo.capture_integrity.analyzed_at, photo.capture_integrity.confidence,
      photo.capture_integrity.disposition, photo.capture_integrity.model, [...photo.capture_integrity.signals].sort(),
      photo.capture_integrity.status, photo.capture_integrity.verdict] : null
  ])
)

export const canReviewPhotos = (status: string) =>
  status === 'draft' || status === 'active' || status === 'failed' || status === 'verified'

export interface VerifiedPhotoResult {
  photoKey: string
  slot: number
  label: string
}

/** Verified decisions only count while they still describe the capture's current photos. */
export const verifiedPhotoResults = (
  photoReview: { snapshot: string; decisions: readonly PhotoReviewDecision[] } | undefined,
  photos: readonly SnapPhoto[]
): VerifiedPhotoResult[] => {
  if (!photoReview || photoReview.snapshot !== photoReviewSnapshot(photos)) return []
  const verified = new Set(photoReview.decisions.filter(item => item.status === 'verified').map(item => item.photoKey))
  return photos
    .filter(photo => verified.has(photo.r2_key))
    .sort((a, b) => a.slot - b.slot)
    .map(photo => ({ photoKey: photo.r2_key, slot: photo.slot, label: photo.label }))
}

const VERIFIED_PHOTO_PATH = '/api/admin/verification-entries/verified-photo'

export const verifiedPhotoUrl = (entryId: string, photoKey: string) =>
  `${VERIFIED_PHOTO_PATH}?id=${encodeURIComponent(entryId)}&key=${encodeURIComponent(photoKey)}`

const fileSegment = (value: string) => value.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '')

export const verifiedPhotoFileName = (photo: VerifiedPhotoResult) =>
  `${String(photo.slot).padStart(2, '0')}-${fileSegment(photo.label) || `slot-${photo.slot}`}-stamped.jpg`
