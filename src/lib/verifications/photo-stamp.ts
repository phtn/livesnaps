import type { Doc } from '../../../convex/_generated/dataModel'
import type { SnapPhoto } from '../../../convex/snaps/d'

const recorded = (value: string | undefined) => value?.trim() || 'Not recorded'
const number = (value: number | null | undefined, unit = '') =>
  value !== null && value !== undefined && Number.isFinite(value) ? `${value}${unit}` : 'Not recorded'
const timestamp = (value: number) => Number.isFinite(value) && !Number.isNaN(new Date(value).getTime())
  ? new Date(value).toISOString().replace('T', ' ').replace('Z', ' UTC')
  : 'Not recorded'

/** Only stored capture evidence is used. Session geocoding is not presented as photo GPS. */
export function photoStampLines(snap: Pick<Doc<'snaps'>, 'location_session' | 'location'>, photo: SnapPhoto): string[] {
  const address = snap.location_session?.address ?? snap.location?.address
  const lines = [
    `CAPTURED: ${timestamp(photo.captured_at)}  |  PHOTO ${photo.slot}: ${photo.label}`,
    `SESSION ADDRESS: ${recorded(address?.full_address)}`
  ]
  if (address) {
    const rich = snap.location_session?.address
    const details = [
      ['Number', rich?.address_number], ['Street', address.street_name], ['Unit', rich?.secondary_address],
      ['Unit type', rich?.secondary_designator], ['Unit number', rich?.secondary_identifier], ['Lot', rich?.lot_number],
      ['Neighborhood', rich?.neighborhood], ['Locality', address.locality], ['City', address.city],
      ['District', rich?.district], ['Region', address.region], ['Region code', rich?.region_code],
      ['Postcode', address.postcode], ['Country', address.country], ['Country code', address.country_code],
      ['Country alpha-3', address.country_code_alpha_3]
    ].filter(([, value]) => value?.trim()).map(([label, value]) => `${label}: ${value}`)
    if (details.length) lines.push(details.join('  |  '))
    if (rich?.components && Object.keys(rich.components).length) {
      lines.push(`ADDRESS COMPONENTS: ${Object.entries(rich.components).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}: ${value}`).join('  |  ')}`)
    }
    lines.push(`ADDRESS POINT: ${number(address.latitude)}, ${number(address.longitude)}  |  Source: ${address.provider}${rich?.accuracy ? `  |  Accuracy: ${rich.accuracy}` : ''}`)
  }
  const gps = photo.location
  if (gps) {
    lines.push(
      `PHOTO GPS: ${number(gps.latitude)}, ${number(gps.longitude)}  |  Horizontal accuracy: ±${number(gps.accuracy_meters, ' m')}`,
      `Altitude: ${number(gps.altitude_meters, ' m')}  |  Vertical accuracy: ${number(gps.altitude_accuracy_meters, ' m')}  |  Heading: ${number(gps.heading_degrees, '°')}  |  Speed: ${number(gps.speed_meters_per_second, ' m/s')}`,
      `GPS FIX: ${timestamp(gps.captured_at)}`
    )
  } else {
    lines.push('PHOTO GPS: Not recorded for this photo')
  }
  const match = snap.location_session?.country_code_matches_ipinfo ?? snap.location?.country_code_matches_ipinfo
  lines.push(`GPS / IP COUNTRY MATCH: ${match === true ? 'Yes' : match === false ? 'No' : 'Not recorded'}`)
  if (snap.location_session?.address.attribution) lines.push(snap.location_session.address.attribution)
  return lines
}
