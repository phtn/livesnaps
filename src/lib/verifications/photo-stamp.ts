import type { Doc } from '../../../convex/_generated/dataModel'
import type { SnapPhoto } from '../../../convex/snaps/d'

const NOT_RECORDED = 'Not recorded'

const timestamp = (value: number) => Number.isFinite(value) && !Number.isNaN(new Date(value).getTime())
  ? new Date(value).toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
  : NOT_RECORDED

const coordinate = (value: number) => Number.isFinite(value) ? value.toFixed(6) : '?'

export const PHOTO_STAMP_TITLE = 'Capture Session'

/** Only stored capture evidence is used. Session geocoding is never presented as photo GPS. */
export function photoStampLines(snap: Pick<Doc<'snaps'>, 'location_session' | 'location'>, photo: SnapPhoto): string[] {
  const address = (snap.location_session?.address ?? snap.location?.address)?.full_address?.trim()
  const gps = photo.location
  const accuracy = gps && Number.isFinite(gps.accuracy_meters) ? `  ±${Math.round(gps.accuracy_meters * 10) / 10} m` : ''
  return [
    `Timestamp: ${timestamp(photo.captured_at)}`,
    `Address: ${address || NOT_RECORDED}`,
    `Photo GPS: ${gps ? `${coordinate(gps.latitude)}, ${coordinate(gps.longitude)}${accuracy}` : NOT_RECORDED}`
  ]
}
