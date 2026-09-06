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
import { action, mutation } from '../_generated/server'
import { getR2ObjectBytes, isR2Configured, toBase64 as bytesToBase64 } from '../lib/r2'
import { createVerificationEntrySchema, verificationEntryDocumentSchema } from './d'

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

    if (identity?.admin !== true) {
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

    const existingEntry: VerificationEntryDoc | null = await ctx.db
      .query('verificationEntries')
      .withIndex('by_uploadId', (q) => q.eq('uploadId', uploadId))
      .unique()

    if (existingEntry) {
      throw new ConvexError('A verification entry already uses this upload ID.')
    }

    const snapForCreate: SnapDoc | null = await ctx.db
      .query('snaps')
      .withIndex('by_metadata_upload_id', (q) => q.eq('metadata.upload_id', uploadId))
      .unique()
      .catch((): null => null)

    if (!snapForCreate) {
      throw new ConvexError('Snap not found for upload ID.')
    }

    if (snapForCreate.handler || snapForCreate.verification_status) {
      throw new ConvexError('Snap already used for verification.')
    }

    const createdAt: number = Date.now()
    const entryId: Id<'verificationEntries'> = await ctx.db.insert('verificationEntries', {
      applicant,
      attachments,
      ...(ccEmailAddress ? { ccEmailAddress } : {}),
      createdAt,
      emailFromAddress,
      emailToAddress,
      plateNumber,
      senderName,
      senderTokenIdentifier,
      senderUid,
      status: 'draft' as const,
      updatedAt: createdAt,
      uploadId
    })

    await ctx.db.patch(snapForCreate._id, {
      handler: { email: emailFromAddress, name: senderName },
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
    if (identity?.admin !== true) {
      throw new ConvexError('Unauthorized.')
    }
    const entry: VerificationEntryDoc | null = await ctx.db.get('verificationEntries', args.id)
    if (!entry) throw new ConvexError('Entry not found.')
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
    if (identity?.admin !== true) {
      throw new ConvexError('Unauthorized.')
    }
    const entry: VerificationEntryDoc | null = await ctx.runQuery(
      internal.verificationEntries.helpers.getEntryInternal,
      { id: args.id }
    )
    if (!entry) throw new ConvexError('Entry not found.')

    const normalizedAttachments: string[] = args.attachments
      ? args.attachments
          .map((a: string): string => a.trim().toLowerCase())
          .filter((a: string): boolean => Boolean(a))
          .filter((value: string, index: number, arr: string[]): boolean => arr.indexOf(value) === index)
      : (entry.attachments ?? [...DEFAULT_VERIFICATION_ATTACHMENTS])
    const finalAttachments: string[] =
      normalizedAttachments.length > 0 ? normalizedAttachments : [...DEFAULT_VERIFICATION_ATTACHMENTS]

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
        attachments: emailAttachments.map(
          (attachment: EmailAttachment): ResendAttachmentPayload => ({
            filename: attachment.filename,
            content: attachment.content,
            content_type: attachment.contentType
          })
        )
      }

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
