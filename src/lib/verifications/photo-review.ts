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
