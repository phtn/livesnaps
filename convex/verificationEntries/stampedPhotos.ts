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
import { PHOTO_STAMP_TITLE, photoStampLines } from '../../src/lib/verifications/photo-stamp'

let fontPath: Promise<string> | undefined
const loadFont = () => fontPath ??= (async () => {
  const directory = await mkdtemp(join(tmpdir(), 'livesnaps-photo-font-'))
  const path = join(directory, 'LiberationSans-Regular.ttf')
  await writeFile(path, gunzipSync(Buffer.from(liberationSansGzip, 'base64')))
  return path
})().catch(error => { fontPath = undefined; throw error })

const escapeMarkup = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!)

/**
 * Draws a bordered, translucent panel over the bottom of the photo. The photo
 * keeps its own dimensions; the panel's height follows the wrapped address.
 */
export async function stampPhotoBytes(bytes: Uint8Array, snap: Pick<Doc<'snaps'>, 'location_session' | 'location'>, photo: SnapPhoto): Promise<Buffer> {
  const original = await sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'error' })
    .autoOrient()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#101820' })
    .raw().toBuffer({ resolveWithObject: true })
  const { width, height } = original.info
  const base = Math.min(width, height * 1.5)
  const margin = Math.max(8, Math.round(base * 0.02))
  const padding = Math.max(8, Math.round(base * 0.02))
  const border = Math.max(2, Math.round(base * 0.003))
  const fontSize = Math.max(12, Math.round(base * 0.022))
  const panelWidth = width - margin * 2
  const body = photoStampLines(snap, photo).map(line => {
    const split = line.indexOf(': ')
    return `<span foreground="#a5b4fc">${escapeMarkup(line.slice(0, split + 1))}</span> ${escapeMarkup(line.slice(split + 2))}`
  })
  const text = await sharp({ text: {
    text: `<span foreground="#f8fafc"><span size="small" foreground="#c7d2fe" letter_spacing="1024">${escapeMarkup(PHOTO_STAMP_TITLE.toUpperCase())}</span>\n${body.join('\n')}</span>`,
    font: `Liberation Sans ${fontSize}`,
    fontfile: await loadFont(),
    width: panelWidth - padding * 2,
    spacing: Math.round(fontSize * 0.3),
    wrap: 'word-char',
    rgba: true
  } }).png().toBuffer({ resolveWithObject: true })
  const panelHeight = text.info.height + padding * 2
  // Reject a stamp that would cover the photo instead of silently clipping evidence.
  if (panelHeight > height * 0.6) throw new Error('Capture details are too large to stamp on this photo.')
  const top = height - margin - panelHeight
  const radius = Math.round(padding * 0.6)
  const panel = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${panelWidth}" height="${panelHeight}">
    <rect x="${border / 2}" y="${border / 2}" width="${panelWidth - border}" height="${panelHeight - border}" rx="${radius}" ry="${radius}"
      fill="#0b1020" fill-opacity="0.72" stroke="#a5b4fc" stroke-opacity="0.85" stroke-width="${border}"/>
  </svg>`)
  return sharp(original.data, { raw: original.info })
    .composite([
      { input: panel, top, left: margin },
      { input: text.data, top: top + padding, left: margin + padding }
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
