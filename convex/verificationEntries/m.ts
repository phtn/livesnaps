import { ConvexError, v } from 'convex/values'
import { isSnapUploadId } from '../../src/lib/r2/snap-images'
import { MAX_PLATE_NUMBER_LENGTH, normalizePlateNumber } from '../../src/lib/snaps/vehicle-details'
import {
  DEFAULT_VERIFICATION_ATTACHMENTS,
  isVerificationEmailAddress,
  VERIFICATION_APPLICANT_MAX_LENGTH
} from '../../src/lib/verifications/entries'
import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import type { ActionCtx, MutationCtx } from '../_generated/server'
import { action, env, mutation } from '../_generated/server'
import { toBase64 as bytesToBase64, getR2ObjectBytes, isR2Configured } from '../lib/r2'
import { requireSnapAccess, requireVerificationEntryAccess } from '../lib/submissionAccess'
import { createVerificationEntrySchema, verificationEntryDocumentSchema, type VerificationUpload } from './d'
import { ATTACHMENT_UPLOAD_TTL_MS } from './uploads'

const FIREBASE_UID_MAX_LENGTH = 128

type VerificationEntryDoc = Doc<'verificationEntries'>
type SnapDoc = Doc<'snaps'>
type SendEmailArgs = {
  id: Id<'verificationEntries'>
  attachments?: string[]
  subject?: string
  body?: string
}

type EmailAttachment = {
  filename: string
  content: string
  contentType?: string
}

type ResendAttachmentPayload = {
  filename: string
  content: string
  content_type?: string
}

/**
 * Resend rejects any sender outside a verified domain, so this default tracks
 * the domain the account actually owns. `RESEND_FROM` overrides it without a
 * deploy, which is how a second verified domain would be adopted.
 */
const DEFAULT_FROM_ADDRESS = 'hq@livesnapsnow.com'

/**
 * Resend caps a whole message at 40MB. Snap photos run to roughly 2MB each and
 * base64 inflates them by a third, so five slots already sit near half that.
 * Stopping here names the problem; letting it through returns an opaque Resend
 * failure after every photo has been fetched.
 */
const MAX_ATTACHMENT_BYTES = 24 * 1024 * 1024

/**
 * One browsed file, and how many of them an entry may carry. The per-file cap
 * is well inside the message budget so a single mistaken pick cannot exhaust
 * it, and the count keeps the send loop bounded.
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const MAX_UPLOAD_COUNT = 10
const MAX_UPLOAD_NAME_LENGTH = 160

/** Falls back to a stable name: a filename is what the recipient sees. */
const normalizeUploadName = (value: string): string => {
  const name = value
    .trim()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[/\\]+/g, '-')
    .slice(0, MAX_UPLOAD_NAME_LENGTH)
  return name || 'attachment'
}

const normalizeApplicant = (value: string): string => {
  const applicant = value.trim().replace(/\s+/g, ' ')

  if (!applicant) {
    throw new ConvexError('Applicant name is required.')
  }

  if (applicant.length > VERIFICATION_APPLICANT_MAX_LENGTH) {
    throw new ConvexError(`Applicant name must be ${VERIFICATION_APPLICANT_MAX_LENGTH} characters or fewer.`)
  }

  return applicant
}

const normalizeEmailAddress = (value: string, label: string): string => {
  const emailAddress = value.trim().toLowerCase()

  if (!isVerificationEmailAddress(emailAddress)) {
    throw new ConvexError(`${label} must be a valid email address.`)
  }

  return emailAddress
}

const normalizeOptionalEmailAddress = (value: string | undefined): string | undefined => {
  const emailAddress = value?.trim().toLowerCase()
  return emailAddress ? normalizeEmailAddress(emailAddress, 'CC email address') : undefined
}

/**
 * `btoa` is Latin-1 only, so text goes through UTF-8 bytes first. An applicant
 * name with an accent in it would otherwise throw here rather than at send.
 */
const toBase64 = (value: string): string => {
  try {
    return bytesToBase64(new TextEncoder().encode(value))
  } catch {
    return ''
  }
}

export const create = mutation({
  args: createVerificationEntrySchema,
  returns: verificationEntryDocumentSchema,
  handler: async (
    ctx: MutationCtx,
    args: {
      applicant: string
      attachments?: string[]
      ccEmailAddress?: string
      emailToAddress: string
      plateNumber: string
      uploadId: string
    }
  ): Promise<VerificationEntryDoc> => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      throw new ConvexError('Unauthorized.')
    }

    const senderUid: string = identity.subject.trim()
    const senderTokenIdentifier: string = identity.tokenIdentifier.trim()
    const emailFromAddress: string = normalizeEmailAddress(identity.email ?? '', 'Your account email')
    const senderName: string = identity.name?.trim().replace(/\s+/g, ' ') || emailFromAddress
    const applicant: string = normalizeApplicant(args.applicant)
    const plateNumber: string = normalizePlateNumber(args.plateNumber)
    const emailToAddress: string = normalizeEmailAddress(args.emailToAddress, 'Recipient email address')
    const normalizedCcEmailAddress: string | undefined = normalizeOptionalEmailAddress(args.ccEmailAddress)
    const ccEmailAddress: string | undefined =
      normalizedCcEmailAddress === emailToAddress ? undefined : normalizedCcEmailAddress
    const uploadId: string = args.uploadId.trim()

    const normalizeAttachments = (value: string[] | undefined): string[] => {
      const raw: string[] = value && value.length > 0 ? value : [...DEFAULT_VERIFICATION_ATTACHMENTS]
      const normalized: string[] = raw
        .map((item: string): string => item.trim().toLowerCase())
        .filter((item: string): boolean => item.length > 0)
        .filter((item: string, index: number, arr: string[]): boolean => arr.indexOf(item) === index)
      return normalized.length > 0 ? normalized : [...DEFAULT_VERIFICATION_ATTACHMENTS]
    }

    const attachments: string[] = normalizeAttachments(args.attachments)

    if (!senderUid || senderUid.length > FIREBASE_UID_MAX_LENGTH || !senderTokenIdentifier) {
      throw new ConvexError('Your authenticated sender identity is invalid.')
    }

    if (!plateNumber || args.plateNumber.trim().length > MAX_PLATE_NUMBER_LENGTH) {
      throw new ConvexError(`Plate number must be between 1 and ${MAX_PLATE_NUMBER_LENGTH} characters.`)
    }

    if (!isSnapUploadId(uploadId)) {
      throw new ConvexError('Upload ID must be a valid UUID.')
    }

    const snapForCreate: SnapDoc | null = await ctx.db
      .query('snaps')
      .withIndex('by_metadata_upload_id', (q) => q.eq('metadata.upload_id', uploadId))
      .unique()
      .catch((): null => null)

    if (!snapForCreate) {
      throw new ConvexError('Snap not found for upload ID.')
    }

    await requireSnapAccess(ctx, snapForCreate, 'member')

    const existingEntry: VerificationEntryDoc | null = await ctx.db
      .query('verificationEntries')
      .withIndex('by_uploadId', (q) => q.eq('uploadId', uploadId))
      .unique()

    if (existingEntry) {
      throw new ConvexError('A verification entry already uses this upload ID.')
    }

    if (snapForCreate.handler || snapForCreate.verification_status) {
      throw new ConvexError('Snap already used for verification.')
    }

    // The applicant's avatar is read from their user record through the snap's
    // firebase uid, and the sender's comes straight off the calling identity.
    // Both are copied onto the entry so the queue can render faces without a
    // join, and so a later profile change does not rewrite history.
    const applicantUid: string = snapForCreate.firebase_uid?.trim() ?? ''
    const applicantUser = applicantUid
      ? await ctx.db
          .query('users')
          .withIndex('by_firebaseUid', (q) => q.eq('firebaseUid', applicantUid))
          .unique()
          .catch((): null => null)
      : null

    const applicantImageUrl: string | undefined = applicantUser?.imageUrl?.trim() || undefined
    const senderImageUrl: string | undefined = identity.pictureUrl?.trim() || undefined

    const createdAt: number = Date.now()
    const entryId: Id<'verificationEntries'> = await ctx.db.insert('verificationEntries', {
      accountId: snapForCreate.accountId,
      applicant,
      ...(applicantImageUrl ? { applicantImageUrl } : {}),
      attachments,
      ...(ccEmailAddress ? { ccEmailAddress } : {}),
      createdAt,
      emailFromAddress,
      emailToAddress,
      plateNumber,
      ...(senderImageUrl ? { senderImageUrl } : {}),
      senderName,
      senderTokenIdentifier,
      senderUid,
      status: 'draft' as const,
      updatedAt: createdAt,
      uploadId
    })

    await ctx.db.patch(snapForCreate._id, {
      handler: { email: emailFromAddress, name: senderName, ...(senderImageUrl ? { image_url: senderImageUrl } : {}) },
      verification_status: 'draft' as const,
      updated_at: Date.now()
    })

    const entry: VerificationEntryDoc | null = await ctx.db.get('verificationEntries', entryId)

    if (!entry) {
      throw new ConvexError('Unable to read the created verification entry.')
    }

    return entry
  }
})

export const updateAttachments = mutation({
  args: {
    id: v.id('verificationEntries'),
    attachments: v.array(v.string())
  },
  returns: verificationEntryDocumentSchema,
  handler: async (
    ctx: MutationCtx,
    args: { id: Id<'verificationEntries'>; attachments: string[] }
  ): Promise<VerificationEntryDoc> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new ConvexError('Unauthorized.')
    }
    const entry: VerificationEntryDoc | null = await ctx.db.get('verificationEntries', args.id)
    if (!entry) throw new ConvexError('Entry not found.')
    await requireVerificationEntryAccess(ctx, entry, 'member')
    if (entry.status === 'submitted') throw new ConvexError('This entry has already been sent.')
    const normalized: string[] = args.attachments
      .map((item: string): string => item.trim().toLowerCase())
      .filter((item: string): boolean => item.length > 0)
      .filter((item: string, index: number, arr: string[]): boolean => arr.indexOf(item) === index)
    if (normalized.length === 0) throw new ConvexError('At least one attachment is required.')
    await ctx.db.patch(args.id, { attachments: normalized, updatedAt: Date.now() })
    const updated: VerificationEntryDoc | null = await ctx.db.get('verificationEntries', args.id)
    if (!updated) throw new ConvexError('Unable to read updated entry.')
    return updated
  }
})

/**
 * A short-lived URL the Worker posts the operator's file to. The browser on the
 * admin origin holds only a session cookie, so it never sees this: the Worker
 * mints the identity, takes the upload URL, and streams the bytes through.
 */
export const generateAttachmentUploadUrl = mutation({
  args: { id: v.id('verificationEntries') },
  returns: v.string(),
  handler: async (ctx, { id }): Promise<string> => {
    const entry = await ctx.db.get('verificationEntries', id)
    if (!entry) throw new ConvexError('Entry not found.')
    const { identity, account } = await requireVerificationEntryAccess(ctx, entry, 'member')
    if (entry.status === 'submitted') throw new ConvexError('This entry has already been sent.')
    const token = crypto.randomUUID()
    const intentId = await ctx.db.insert('verificationUploadIntents', {
      accountId: account._id,
      entryId: id,
      tokenIdentifier: identity.tokenIdentifier,
      token,
      createdAt: Date.now(),
      expiresAt: Date.now() + ATTACHMENT_UPLOAD_TTL_MS,
      state: 'pending'
    })
    await ctx.scheduler.runAfter(ATTACHMENT_UPLOAD_TTL_MS, internal.verificationEntries.uploads.cleanup, { intentId })
    return `${env.CONVEX_SITE_URL}/verification-attachments?token=${encodeURIComponent(token)}`
  }
})

/** Records a stored file against an entry once its bytes are in place. */
export const attachUpload = mutation({
  args: {
    id: v.id('verificationEntries'),
    contentType: v.optional(v.string()),
    name: v.string(),
    size: v.number(),
    storageId: v.id('_storage')
  },
  returns: verificationEntryDocumentSchema,
  handler: async (
    ctx: MutationCtx,
    args: {
      id: Id<'verificationEntries'>
      contentType?: string
      name: string
      size: number
      storageId: Id<'_storage'>
    }
  ): Promise<VerificationEntryDoc> => {
    const entry: VerificationEntryDoc | null = await ctx.db.get('verificationEntries', args.id)
    if (!entry) throw new ConvexError('Entry not found.')
    const { identity, account } = await requireVerificationEntryAccess(ctx, entry, 'member')

    if (entry.status === 'submitted') {
      throw new ConvexError('This entry has already been sent.')
    }

    const intent = await ctx.db
      .query('verificationUploadIntents')
      .withIndex('by_storageId', (q) => q.eq('storageId', args.storageId))
      .unique()
    if (
      intent?.state !== 'uploaded' ||
      intent.expiresAt <= Date.now() ||
      intent.entryId !== entry._id ||
      intent.accountId !== account._id ||
      intent.tokenIdentifier !== identity.tokenIdentifier
    ) {
      throw new ConvexError('Upload does not belong to this entry. Upload the file again.')
    }
    if (args.size !== intent.size) throw new ConvexError('Attachment size does not match the uploaded file.')
    const uploads: VerificationUpload[] = entry.uploads ?? []

    if (uploads.length >= MAX_UPLOAD_COUNT) {
      throw new ConvexError(`An entry can carry at most ${MAX_UPLOAD_COUNT} uploaded files.`)
    }

    if (!Number.isFinite(args.size) || args.size <= 0) {
      throw new ConvexError('The uploaded file is empty.')
    }

    if (args.size > MAX_UPLOAD_BYTES) {
      throw new ConvexError(`Each file must be under ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`)
    }

    const totalBytes: number = uploads.reduce((total, upload) => total + upload.size, 0) + args.size
    if (totalBytes > MAX_ATTACHMENT_BYTES) {
      throw new ConvexError(
        `Uploads total ${Math.round(totalBytes / 1024 / 1024)}MB, over the ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB message limit.`
      )
    }

    const upload: VerificationUpload = {
      contentType: intent.contentType ?? 'application/octet-stream',
      name: normalizeUploadName(args.name),
      size: args.size,
      storageId: args.storageId,
      uploadedAt: Date.now()
    }

    await ctx.db.patch(args.id, { uploads: [...uploads, upload], updatedAt: Date.now() })
    await ctx.db.patch(intent._id, { state: 'attached' })

    const updated: VerificationEntryDoc | null = await ctx.db.get('verificationEntries', args.id)
    if (!updated) throw new ConvexError('Unable to read the updated entry.')

    return updated
  }
})

/** Drops a file from the entry and from storage — an unsent draft owns it. */
export const removeUpload = mutation({
  args: {
    id: v.id('verificationEntries'),
    storageId: v.id('_storage')
  },
  returns: verificationEntryDocumentSchema,
  handler: async (
    ctx: MutationCtx,
    args: { id: Id<'verificationEntries'>; storageId: Id<'_storage'> }
  ): Promise<VerificationEntryDoc> => {
    const entry: VerificationEntryDoc | null = await ctx.db.get('verificationEntries', args.id)
    if (!entry) throw new ConvexError('Entry not found.')
    await requireVerificationEntryAccess(ctx, entry, 'member')

    if (entry.status === 'submitted') throw new ConvexError('This entry has already been sent.')
    const uploads: VerificationUpload[] = entry.uploads ?? []
    const remaining: VerificationUpload[] = uploads.filter((upload) => upload.storageId !== args.storageId)

    if (remaining.length !== uploads.length) {
      await ctx.db.patch(args.id, { uploads: remaining, updatedAt: Date.now() })
      // Storage is dropped after the reference is, so a failure here leaves an
      // orphaned blob rather than a row pointing at nothing.
      await ctx.storage.delete(args.storageId)
    }

    const updated: VerificationEntryDoc | null = await ctx.db.get('verificationEntries', args.id)
    if (!updated) throw new ConvexError('Unable to read the updated entry.')

    return updated
  }
})

export const sendEmail = action({
  args: {
    id: v.id('verificationEntries'),
    attachments: v.optional(v.array(v.string())),
    subject: v.optional(v.string()),
    body: v.optional(v.string())
  },
  returns: verificationEntryDocumentSchema,
  handler: async (ctx: ActionCtx, args: SendEmailArgs): Promise<VerificationEntryDoc> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new ConvexError('Unauthorized.')
    }
    const entry: VerificationEntryDoc | null = await ctx.runQuery(
      internal.verificationEntries.helpers.getEntryInternal,
      { id: args.id }
    )
    if (!entry) throw new ConvexError('Entry not found.')
    if (entry.status === 'submitted') throw new ConvexError('This entry has already been sent.')

    const normalizedAttachments: string[] = args.attachments
      ? args.attachments
          .map((a: string): string => a.trim().toLowerCase())
          .filter((a: string): boolean => Boolean(a))
          .filter((value: string, index: number, arr: string[]): boolean => arr.indexOf(value) === index)
      : (entry.attachments ?? [...DEFAULT_VERIFICATION_ATTACHMENTS])
    // The defaults only stand in when the message would otherwise be bare. An
    // entry carrying uploaded files is not bare, so an empty name list there
    // means "just the files" rather than "you forgot to choose".
    const hasUploads: boolean = (entry.uploads?.length ?? 0) > 0
    const finalAttachments: string[] =
      normalizedAttachments.length > 0 || hasUploads ? normalizedAttachments : [...DEFAULT_VERIFICATION_ATTACHMENTS]

    const snaps: SnapDoc | null = await ctx.runQuery(internal.verificationEntries.helpers.getSnapByUploadIdInternal, {
      uploadId: entry.uploadId
    })

    const emailAttachments: EmailAttachment[] = []
    const attachmentErrors: string[] = []
    // Counted as they are pushed rather than recovered from filenames later:
    // a filename check would quietly pass on any attachment that happened to
    // be named the right way.
    let photoAttachmentCount = 0
    let hasReportAttachment = false
    let attachedBytes = 0

    const generateFullReport = (): string => {
      const lines: string[] = [
        `Verification Report`,
        `===================`,
        `Applicant: ${entry.applicant}`,
        `Plate: ${entry.plateNumber}`,
        `Upload ID: ${entry.uploadId}`,
        `Sender: ${entry.senderName} <${entry.emailFromAddress}>`,
        `Recipients: ${entry.emailToAddress}${entry.ccEmailAddress ? ` / CC ${entry.ccEmailAddress}` : ''}`,
        `Status: ${entry.status}`,
        `Created: ${new Date(entry.createdAt).toISOString()}`,
        ``,
        `Proof details: ${snaps ? `found (${snaps._id})` : 'not found for uploadId'}`,
        snaps ? `Photos: ${snaps.metadata.photos.length} slots` : 'Photos: unknown',
        snaps ? `Vehicle: ${[snaps.year, snaps.make, snaps.model].filter(Boolean).join(' ') || 'pending'}` : '',
        snaps?.location_session ? `Location: ${snaps.location_session.address.full_address}` : '',
        ``,
        `Generated at ${new Date().toISOString()}`
      ]
      return lines.join('\n')
    }

    if (finalAttachments.includes('photos')) {
      if (!snaps) {
        attachmentErrors.push(`snap not found for uploadId ${entry.uploadId}`)
      } else if (snaps.metadata.photos.length === 0) {
        attachmentErrors.push(`snap ${entry.uploadId} has no photos`)
      } else if (!isR2Configured()) {
        attachmentErrors.push('R2 is not configured for this deployment, so photos cannot be attached')
      } else {
        // Each photo is read straight out of R2 and attached as the real
        // `.webp` bytes. A slot that fails to read is named rather than
        // swallowed, so a partial send is visible instead of looking complete.
        const plateSlug: string = entry.plateNumber.replace(/\s+/g, '_')

        for (const photo of snaps.metadata.photos) {
          try {
            const label: string = photo.label.trim().replace(/\s+/g, '-').toLowerCase() || `slot-${photo.slot}`
            const bytes: ArrayBuffer = await getR2ObjectBytes(photo.r2_key)
            const content: string = bytesToBase64(bytes)

            if (!content) {
              attachmentErrors.push(`photo slot ${photo.slot}: empty content`)
              continue
            }

            emailAttachments.push({
              filename: `${photo.slot}-${label}-${plateSlug}.webp`,
              content,
              contentType: photo.content_type
            })
            photoAttachmentCount += 1
            attachedBytes += content.length
          } catch (error: unknown) {
            const message: string = error instanceof Error ? error.message : String(error)
            attachmentErrors.push(`photo slot ${photo.slot}: ${message}`)
          }
        }
      }
    }

    if (finalAttachments.includes('full report')) {
      try {
        const report: string = generateFullReport()
        const filename: string = `verification-report-${entry.plateNumber.replace(/\s+/g, '_')}.txt`
        const content: string = toBase64(report)
        if (!content) {
          attachmentErrors.push('full report: empty content')
        } else {
          emailAttachments.push({ filename, content, contentType: 'text/plain' })
          hasReportAttachment = true
        }
      } catch (error: unknown) {
        const message: string = error instanceof Error ? error.message : String(error)
        attachmentErrors.push(`full report: ${message}`)
      }
    }

    const customNames: string[] = finalAttachments.filter(
      (attachment: string): boolean => attachment !== 'photos' && attachment !== 'full report'
    )
    for (const name of customNames) {
      try {
        const filename: string = name.includes('.') ? name : `${name}.txt`
        const content: string = toBase64(`Custom attachment: ${name} for ${entry.plateNumber}`)
        if (!content) {
          attachmentErrors.push(`${name}: empty content`)
          continue
        }
        emailAttachments.push({ filename, content, contentType: 'application/octet-stream' })
      } catch (error: unknown) {
        const message: string = error instanceof Error ? error.message : String(error)
        attachmentErrors.push(`${name}: ${message}`)
      }
    }

    // Files the operator browsed are attached as their real bytes, read back
    // out of Convex storage. A file that has gone missing is named rather than
    // skipped silently, the same way a missing photo slot is.
    for (const upload of entry.uploads ?? []) {
      try {
        const blob: Blob | null = await ctx.storage.get(upload.storageId)

        if (!blob) {
          attachmentErrors.push(`${upload.name}: the uploaded file is no longer in storage`)
          continue
        }

        const content: string = bytesToBase64(await blob.arrayBuffer())

        if (!content) {
          attachmentErrors.push(`${upload.name}: empty content`)
          continue
        }

        emailAttachments.push({ filename: upload.name, content, contentType: upload.contentType })
        attachedBytes += content.length
      } catch (error: unknown) {
        const message: string = error instanceof Error ? error.message : String(error)
        attachmentErrors.push(`${upload.name}: ${message}`)
      }
    }

    // Nothing empty goes out: an attachment with no content reads to the
    // recipient as a corrupt file rather than a missing one.
    for (const attachment of emailAttachments) {
      if (!attachment.content) {
        attachmentErrors.push(`${attachment.filename}: prepared incorrectly and has no content`)
      }
    }

    try {
      if (attachedBytes > MAX_ATTACHMENT_BYTES) {
        throw new ConvexError(
          `Attachments total ${Math.round(attachedBytes / 1024 / 1024)}MB, over the ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB limit. Send fewer attachments.`
        )
      }

      if (finalAttachments.includes('photos') && photoAttachmentCount === 0) {
        throw new ConvexError(`Failed to prepare photos attachment: ${attachmentErrors.join('; ') || 'unknown'}`)
      }
      if (finalAttachments.includes('full report') && !hasReportAttachment) {
        throw new ConvexError(`Failed to prepare full report attachment: ${attachmentErrors.join('; ') || 'unknown'}`)
      }
      if (attachmentErrors.length > 0 && emailAttachments.length === 0) {
        throw new ConvexError(`No attachments prepared: ${attachmentErrors.join('; ')}`)
      }
      if (attachmentErrors.some((error: string): boolean => error.includes('prepared incorrectly'))) {
        throw new ConvexError(`Attachment validation failed: ${attachmentErrors.join('; ')}`)
      }

      const emailSubject: string = args.subject?.trim() || `Verification – ${entry.plateNumber} – ${entry.applicant}`
      const emailBody: string =
        args.body?.trim() ||
        `Hi ${entry.applicant},\n\nPlease find attached: ${finalAttachments.join(', ')}.\n\nPlate: ${entry.plateNumber}\nUpload ID: ${entry.uploadId}\n\nRegards,\n${entry.senderName}`

      const resendApiKey: string = (process.env.RESEND_API_KEY ?? process.env.RESEND ?? '').trim()
      const resendFrom: string = process.env.RESEND_FROM?.trim() || DEFAULT_FROM_ADDRESS

      // A missing key used to log and fall through, which marked the entry
      // submitted even though nothing was sent. Refusing here keeps the entry's
      // status honest.
      if (!resendApiKey) {
        throw new ConvexError('Resend is not configured for this deployment. Set RESEND_API_KEY.')
      }

      const payload: Record<string, unknown> = {
        from: resendFrom,
        to: [entry.emailToAddress],
        cc: entry.ccEmailAddress ? [entry.ccEmailAddress] : undefined,
        subject: emailSubject,
        text: emailBody,
        attachments: emailAttachments.map((attachment: EmailAttachment): ResendAttachmentPayload => ({
          filename: attachment.filename,
          content: attachment.content,
          content_type: attachment.contentType
        }))
      }

      // Revalidate after attachment preparation; membership can be revoked during external IO.
      await ctx.runQuery(internal.verificationEntries.helpers.getEntryInternal, { id: entry._id })
      const response: Response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const text: string = await response.text().catch((): string => '')
        throw new ConvexError(`Resend API failed (${response.status}): ${text.slice(0, 500)}`)
      }

      // Attachments that failed to prepare but did not fail the checks above —
      // a custom name, say — are worth a line in the logs even on a good send.
      if (attachmentErrors.length > 0) {
        console.warn('[verification sendEmail] sent with attachment errors', {
          entryId: entry._id,
          attachmentErrors
        })
      }

      const updated: VerificationEntryDoc = await ctx.runMutation(
        internal.verificationEntries.helpers.markSubmittedInternal,
        {
          id: args.id,
          attachments: finalAttachments
        }
      )

      await ctx.runMutation(internal.verificationEntries.helpers.setSnapVerificationStatusInternal, {
        uploadId: entry.uploadId,
        verification_status: 'submitted'
      })

      return updated
    } catch (error: unknown) {
      try {
        await ctx.runMutation(internal.verificationEntries.helpers.markFailedInternal, { id: args.id })
      } catch {}
      const message: string = error instanceof Error ? error.message : 'Email send failed'
      throw new ConvexError(message)
    }
  }
})
