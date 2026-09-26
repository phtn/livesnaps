// @vitest-environment node
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { describe, expect, test } from 'vitest'
import type { Doc } from '../_generated/dataModel'
import type { SnapPhoto } from '../snaps/d'
import { photoStampLines } from '../../src/lib/verifications/photo-stamp'
import { stampPhotoBytes } from './stampedPhotos'

const photo: SnapPhoto = {
  captured_at: Date.UTC(2026, 8, 26, 6, 30, 15), slot: 1, label: 'front', content_type: 'image/webp', r2_key: 'test', size: 10,
  location: { latitude: 14.554729, longitude: 121.024445, accuracy_meters: 4.2, altitude_meters: 22,
    altitude_accuracy_meters: 3.1, heading_degrees: 90, speed_meters_per_second: 0, captured_at: Date.UTC(2026, 8, 26, 6, 30, 14) }
}
const snap: Pick<Doc<'snaps'>, 'location_session' | 'location'> = {
  location_session: {
    address: { provider: 'mapbox', attribution: '© Mapbox © OpenStreetMap', mapbox_id: 'test', feature_type: 'address',
      full_address: '123 Ayala Avenue, Barangay San Lorenzo, Makati City, Metro Manila 1223, Philippines',
      latitude: 14.5547, longitude: 121.0244, address_number: '123', street_name: 'Ayala Avenue',
      neighborhood: 'San Lorenzo', city: 'Makati', region: 'Metro Manila', postcode: '1223', country: 'Philippines',
      country_code: 'PH', country_code_alpha_3: 'PHL', components: {} },
    best_accuracy_meters: 4.2, country_code_matches_ipinfo: true, initial: photo.location!, latest: photo.location!,
    started_at: photo.captured_at - 1000, status: 'completed'
  }
}

describe('photo stamp evidence', () => {
  test('includes UTC capture time, full address and every photo telemetry value', () => {
    const text = photoStampLines(snap, photo).join('\n')
    for (const value of ['2026-09-26 06:30:15.000 UTC', snap.location_session!.address.full_address, '14.554729, 121.024445', '4.2 m', '22 m', '3.1 m', '90°', '0 m/s', '2026-09-26 06:30:14.000 UTC', 'PHL']) expect(text).toContain(value)
    expect(text).toContain('SESSION ADDRESS:')
    expect(text).toContain('GPS / IP COUNTRY MATCH: Yes')
  })

  test('never substitutes the session GPS when a photo has none', () => {
    const text = photoStampLines(snap, { ...photo, location: undefined }).join('\n')
    expect(text).toContain('PHOTO GPS: Not recorded for this photo')
    expect(text).not.toContain('PHOTO GPS: 14.')
    expect(photoStampLines({}, { ...photo, location: undefined }).join('\n')).toContain('SESSION ADDRESS: Not recorded')
  })

  test('renders a readable footer below the uncropped original without mutating its bytes', async () => {
    const source = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#305070' } }).webp({ lossless: true }).toBuffer()
    const copy = Buffer.from(source)
    const stamped = await stampPhotoBytes(source, snap, photo)
    const metadata = await sharp(stamped).metadata()
    expect(metadata.format).toBe('jpeg')
    expect(metadata.width).toBe(1200)
    expect(metadata.height).toBeGreaterThan(1000)
    expect(source.equals(copy)).toBe(true)
    const { data } = await sharp(stamped).extract({ left: 100, top: 100, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
    expect([...data].every((value, index) => Math.abs(value - [48, 80, 112][index]) <= 3)).toBe(true)
    const stats = await sharp(stamped).extract({ left: 30, top: 830, width: 1100, height: 100 }).stats()
    expect(stats.channels[0].stdev).toBeGreaterThan(20)
  })

  test('wraps long and escaped location text without dropping the final location fields', async () => {
    const source = await sharp({ create: { width: 320, height: 480, channels: 3, background: '#305070' } }).png().toBuffer()
    const long = { ...snap, location_session: { ...snap.location_session!, address: { ...snap.location_session!.address, full_address: 'Unit <12> & Building "A" — '.repeat(20), country: 'España', components: { floor: '7 & 8' } } } }
    const result = await stampPhotoBytes(source, long, photo)
    expect((await sharp(result).metadata()).width).toBe(960)
    expect(photoStampLines(long, photo).join('\n')).toContain('Country: España')
  })

  test('handles EXIF orientation before appending the footer', async () => {
    const source = await sharp({ create: { width: 1000, height: 600, channels: 3, background: '#305070' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    const result = await stampPhotoBytes(source, {}, photo)
    const metadata = await sharp(result).metadata()
    expect(metadata.width).toBe(960)
    expect(metadata.height).toBeGreaterThan(1000)
    expect(metadata.orientation).toBeUndefined()
  })

  test('refuses corrupt image bytes rather than returning an unstamped original', async () => {
    await expect(stampPhotoBytes(Buffer.from('broken image'), snap, photo)).rejects.toThrow()
  })
})

// Opt-in local artifact for visual QA; normal tests do not write files.
if (process.env.STAMP_PREVIEW_PATH) {
  test('writes a stamp preview', async () => {
    const source = await readFile('public/images/livesnapsnow-og-scale.webp')
    await writeFile(process.env.STAMP_PREVIEW_PATH!, await stampPhotoBytes(source, snap, photo))
  })
}
