'use node'

import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import sharp from 'sharp'
import { ConvexError, v } from 'convex/values'
import type { Doc } from '../_generated/dataModel'
import { internal } from '../_generated/api'
import { action, internalAction } from '../_generated/server'
import { getR2ObjectBytes } from '../lib/r2'
import { liberationSansGzip } from '../lib/fonts/liberationSans'
import type { SnapPhoto } from '../snaps/d'
import { photoStampLines } from '../../src/lib/verifications/photo-stamp'

let fontPath: Promise<string> | undefined
const loadFont = () => fontPath ??= (async () => {
  const directory = await mkdtemp(join(tmpdir(), 'livesnaps-photo-font-'))
  const path = join(directory, 'LiberationSans-Regular.ttf')
  await writeFile(path, gunzipSync(Buffer.from(liberationSansGzip, 'base64')))
  return path
})().catch(error => { fontPath = undefined; throw error })

const escapeMarkup = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!)

/** A separate footer keeps every pixel of capture evidence visible, including the odometer. */
export async function stampPhotoBytes(bytes: Uint8Array, snap: Pick<Doc<'snaps'>, 'location_session' | 'location'>, photo: SnapPhoto): Promise<Buffer> {
  const original = await sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'error' })
    .autoOrient()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#101820' })
    .raw().toBuffer({ resolveWithObject: true })
  const width = Math.max(original.info.width, 960)
  const padding = Math.round(width * 0.025)
  const fontSize = Math.max(18, Math.round(width * 0.016))
  const lines = photoStampLines(snap, photo)
  const text = await sharp({ text: {
    text: `<span foreground="#f0f5fa">${lines.map(escapeMarkup).join('\n')}</span>`,
    font: `Liberation Sans ${fontSize}`,
    fontfile: await loadFont(),
    width: width - padding * 2,
    spacing: Math.round(fontSize * 0.35),
    wrap: 'word-char',
    rgba: true
  } }).png().toBuffer({ resolveWithObject: true })
  const footerHeight = text.info.height + padding * 2 + 4
  // Reject pathological metadata instead of silently clipping the evidence.
  if (footerHeight > 4096) throw new Error('Capture location details are too large for a photo stamp.')
  return sharp({ create: { width, height: original.info.height + footerHeight, channels: 3, background: '#101820' } })
    .composite([
      { input: original.data, raw: original.info, top: 0, left: Math.floor((width - original.info.width) / 2) },
      { input: { create: { width, height: 4, channels: 3, background: '#6ee7b7' } }, top: original.info.height, left: 0 },
      { input: text.data, top: original.info.height + padding + 4, left: padding }
    ])
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer()
}

export interface StampedPhoto { content: string; byteLength: number; filename: string; contentType: 'image/jpeg' }

const stampedPhotoSchema = v.object({ content: v.string(), byteLength: v.number(), filename: v.string(), contentType: v.literal('image/jpeg') })

const slug = (value: string) => value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '')

/** The email attachment and the table's verification results are the same derivative. */
async function renderStampedPhoto(snap: Doc<'snaps'>, photo: SnapPhoto, fallbackName: string): Promise<StampedPhoto> {
  const bytes = await stampPhotoBytes(new Uint8Array(await getR2ObjectBytes(photo.r2_key)), snap, photo)
  if (bytes.byteLength > 3 * 1024 * 1024) throw new ConvexError(`Stamped photo ${photo.slot} exceeds the attachment size limit.`)
  return {
    content: bytes.toString('base64'), byteLength: bytes.byteLength,
    filename: `${photo.slot}-${slug(photo.label) || 'photo'}-${slug(snap.plate_number || fallbackName)}-stamped.jpg`,
    contentType: 'image/jpeg'
  }
}

/** One image per Node call bounds memory and keeps action responses below the payload limit. */
export const renderPhoto = internalAction({
  args: { uploadId: v.string(), photoKey: v.string() },
  returns: stampedPhotoSchema,
  handler: async (ctx, { uploadId, photoKey }): Promise<StampedPhoto> => {
    const snap: Doc<'snaps'> | null = await ctx.runQuery(internal.verificationEntries.helpers.getSnapByUploadIdInternal, { uploadId })
    if (!snap) throw new ConvexError('Snap not found for stamped photos.')
    const photo: SnapPhoto | undefined = snap.metadata.photos.find(item => item.r2_key === photoKey)
    if (!photo) throw new ConvexError('Capture photo changed. Reload before sending.')
    return renderStampedPhoto(snap, photo, uploadId)
  }
})

/** Serves one verified photo's stamp to anyone who can read the entry, viewers included. */
export const renderVerifiedPhoto = action({
  args: { id: v.id('verificationEntries'), photoKey: v.string() },
  returns: stampedPhotoSchema,
  handler: async (ctx, { id, photoKey }): Promise<StampedPhoto> => {
    const result: { snap: Doc<'snaps'>; photo: SnapPhoto } | null = await ctx.runQuery(
      internal.verificationEntries.q.getVerifiedPhotoInternal, { id, photoKey }
    )
    if (!result) throw new ConvexError('This photo is not a current verification result.')
    return renderStampedPhoto(result.snap, result.photo, result.snap.metadata.upload_id)
  }
})
