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
  path: string
  contentType?: string
}

type ResendAttachmentPayload = {
  filename: string
  content: string
  content_type?: string
  path?: string
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

const toBase64 = (value: string): string => {
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(value, 'utf-8').toString('base64')
    }
    return btoa(value)
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

    if (!identity || identity.admin !== true) {
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
    if (!identity || identity.admin !== true) {
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
    if (!identity || identity.admin !== true) {
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

    const generateFullReport = (): string => {
      const lines: string[] = [
        `Verification Report`,
        `===================`,
        `Applicant: ${entry.applicant}`,
        `Plate: ${entry.plateNumber}`,
        `Upload ID: ${entry.uploadId}`,
        `Sender: ${entry.senderName} <${entry.emailFromAddress}>`,
        `Recipients: ${entry.emailToAddress}${entry.ccEmailAddress ? ' / CC ' + entry.ccEmailAddress : ''}`,
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
      if (snaps && snaps.metadata.photos.length > 0) {
        for (const photo of snaps.metadata.photos) {
          try {
            const slotLabel: string = `photo-${photo.slot}`
            const filename: string = `${slotLabel}-${entry.plateNumber.replace(/\s+/g, '_')}.webp`
            const placeholder: string = `Photo slot ${photo.slot} for ${entry.uploadId} - r2_key: ${photo.r2_key ?? 'unknown'}`
            const content: string = toBase64(placeholder)
            if (!content || !filename) {
              attachmentErrors.push(`photo slot ${photo.slot}: missing content or path`)
              continue
            }
            emailAttachments.push({
              filename,
              content,
              path: filename,
              contentType: 'image/webp'
            })
          } catch (error: unknown) {
            const message: string = error instanceof Error ? error.message : String(error)
            attachmentErrors.push(`photo slot ${photo.slot}: ${message}`)
          }
        }
        const photoCount: number = emailAttachments.filter((attachment: EmailAttachment): boolean =>
          attachment.filename.startsWith('photo-')
        ).length
        if (photoCount === 0) {
          attachmentErrors.push('photos requested but no photo attachments were prepared')
        }
      } else {
        const filename: string = `photos-${entry.plateNumber.replace(/\s+/g, '_')}.txt`
        const content: string = toBase64(`No photos found for uploadId ${entry.uploadId}`)
        if (!content || !filename) {
          attachmentErrors.push('photos placeholder: missing content or path')
        } else {
          emailAttachments.push({
            filename,
            content,
            path: filename,
            contentType: 'text/plain'
          })
        }
        if (!snaps) attachmentErrors.push('proof not found for photos attachment')
      }
    }

    if (finalAttachments.includes('full report')) {
      try {
        const report: string = generateFullReport()
        const filename: string = `verification-report-${entry.plateNumber.replace(/\s+/g, '_')}.txt`
        const content: string = toBase64(report)
        if (!content || !filename) {
          attachmentErrors.push('full report: missing content or path')
        } else {
          emailAttachments.push({
            filename,
            content,
            path: filename,
            contentType: 'text/plain'
          })
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
        const path: string = filename
        if (!content || !path) {
          attachmentErrors.push(`${name}: missing content or path`)
          continue
        }
        emailAttachments.push({
          filename,
          content,
          path,
          contentType: 'application/octet-stream'
        })
      } catch (error: unknown) {
        const message: string = error instanceof Error ? error.message : String(error)
        attachmentErrors.push(`${name}: ${message}`)
      }
    }

    // Validate every prepared attachment has content and path before sending
    for (const attachment of emailAttachments) {
      if (!attachment.content || !attachment.path) {
        attachmentErrors.push(`${attachment.filename}: prepared incorrectly and should have a content and path`)
      }
    }

    try {
      const hasPhotos: boolean = emailAttachments.some(
        (attachment: EmailAttachment): boolean =>
          attachment.filename.startsWith('photo-') || attachment.filename.startsWith('photos-')
      )
      const hasReport: boolean = emailAttachments.some((attachment: EmailAttachment): boolean =>
        attachment.filename.includes('verification-report')
      )
      if (finalAttachments.includes('photos') && !hasPhotos) {
        throw new ConvexError(`Failed to prepare photos attachment: ${attachmentErrors.join('; ') || 'unknown'}`)
      }
      if (finalAttachments.includes('full report') && !hasReport) {
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

      const envResendKey: string | undefined = '' //env.RESEND_API_KEY
      const envResendLegacy: string | undefined = '' // env.RESEND
      const processResendKey: string | undefined =
        typeof process !== 'undefined' ? (process.env.RESEND_API_KEY as string | undefined) : undefined
      const processResendLegacy: string | undefined =
        typeof process !== 'undefined'
          ? ((process.env as Record<string, string | undefined>)['RESEND'] as string | undefined)
          : undefined
      const resendApiKey: string = (processResendKey ??
        processResendLegacy ??
        envResendKey ??
        envResendLegacy ??
        '') as string
      const HQ_FROM_ADDRESS = 'hq@bigticket.ph' as const
      const resendFrom: string = HQ_FROM_ADDRESS
      if (resendApiKey) {
        try {
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
        } catch (error: unknown) {
          const message: string = error instanceof Error ? error.message : 'Email send failed'
          throw new ConvexError(message)
        }
      } else {
        console.log('[verification sendEmail] Resend not configured - accounting only', {
          entryId: entry._id,
          to: entry.emailToAddress,
          subject: emailSubject,
          finalAttachments,
          emailAttachments: emailAttachments.map((attachment: EmailAttachment): string => attachment.filename),
          attachmentErrors: attachmentErrors.length ? attachmentErrors : undefined
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
