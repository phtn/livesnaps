import { DEFAULT_VERIFICATION_ATTACHMENTS } from '@/lib/verifications/entries'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { type AdminConvexEnvironment, AdminRequestError, withAdminConvex, withAdminConvexWrite } from './admin-convex'
import { requestedAccountId } from './workspace-routes'

export type AdminVerificationRouteEnvironment = AdminConvexEnvironment

const VERIFICATION_ENTRY_LIST_LIMIT = 250

export function handleAdminVerificationEntryList(
  request: Request,
  environment: AdminVerificationRouteEnvironment = {}
) {
  const params = new URL(request.url).searchParams
  const limit = Number(params.get('limit'))
  if (params.get('page') === '1') {
    return withAdminConvex(request, environment, client => {
      const accountId = requestedAccountId(request)
      if (!accountId) throw new AdminRequestError('Select an Account to continue.')
      return client.query(api.verificationEntries.q.listForAccountPage, {
        accountId, paginationOpts: { numItems: 50, cursor: params.get('cursor') || null }
      })
    }, 'Unable to load verification entries.')
  }

  return withAdminConvex(
    request,
    environment,
    (client) =>
      client.query(api.verificationEntries.q.listAllForAdmin, {
        accountId: requestedAccountId(request),
        limit: Number.isSafeInteger(limit) && limit > 0 ? limit : VERIFICATION_ENTRY_LIST_LIMIT
      }),
    'Unable to load verification entries.'
  )
}

const readJsonBody = async (request: Request): Promise<Record<string, unknown> | null> => {
  try {
    const body: unknown = await request.json()
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const readStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined
  const items = value.flatMap((item) => {
    const text = readString(item)
    return text ? [text] : []
  })
  return items.length > 0 ? items : undefined
}

/**
 * Creates a draft verification entry.
 *
 * Validation is deliberately thin here — plate, applicant, and upload ID are all
 * re-derived and re-checked inside `verificationEntries.m.create` against the
 * snap itself, so duplicating those rules in the Worker would only give them a
 * second place to drift.
 */
export function handleAdminVerificationEntryCreate(
  request: Request,
  environment: AdminVerificationRouteEnvironment = {}
) {
  return withAdminConvexWrite(
    request,
    environment,
    async (client) => {
      const body = await readJsonBody(request)
      if (!body) throw new AdminRequestError('A valid JSON request body is required.')

      const applicant = readString(body.applicant)
      const emailToAddress = readString(body.emailToAddress)
      const plateNumber = readString(body.plateNumber)
      const uploadId = readString(body.uploadId)

      if (!applicant || !emailToAddress || !plateNumber || !uploadId) {
        throw new AdminRequestError('applicant, emailToAddress, plateNumber, and uploadId are all required.')
      }

      const ccEmailAddress = readString(body.ccEmailAddress)

      return client.mutation(api.verificationEntries.m.create, {
        applicant,
        attachments: readStringArray(body.attachments) ?? [...DEFAULT_VERIFICATION_ATTACHMENTS],
        ...(ccEmailAddress ? { ccEmailAddress } : {}),
        emailToAddress,
        plateNumber,
        uploadId
      })
    },
    'Unable to create the verification entry.'
  )
}

/**
 * The per-file ceiling the Worker enforces before it spends a Convex upload
 * URL. `attachUpload` checks it again against the recorded size — this one is
 * only here to reject a hopeless file before its bytes cross the wire.
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/**
 * Takes one browsed file and hands it to Convex storage.
 *
 * The browser on the admin origin has no Convex identity, so it cannot post to
 * a Convex upload URL itself: it posts the file here, and the Worker — which
 * already mints an ID token per request — takes the upload URL, streams the
 * bytes to it, and records the result against the entry.
 */
export function handleAdminVerificationEntryAttachmentUpload(
  request: Request,
  environment: AdminVerificationRouteEnvironment = {}
) {
  return withAdminConvexWrite(
    request,
    environment,
    async (client) => {
      let form: FormData

      try {
        form = await request.formData()
      } catch {
        throw new AdminRequestError('A multipart request body with a file is required.')
      }

      const id = readString(form.get('id'))
      if (!id) throw new AdminRequestError('A verification entry ID is required.')

      const file = form.get('file')
      if (!(file instanceof File)) throw new AdminRequestError('A file is required.')

      if (file.size <= 0) throw new AdminRequestError('The selected file is empty.')

      if (file.size > MAX_UPLOAD_BYTES) {
        throw new AdminRequestError(`Each file must be under ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`)
      }

      const contentType = file.type.trim() || 'application/octet-stream'
      const uploadUrl: string = await client.mutation(api.verificationEntries.m.generateAttachmentUploadUrl, { id: id as Id<'verificationEntries'> })

      const stored = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'content-type': contentType },
        body: file
      })

      if (!stored.ok) throw new AdminRequestError('The file could not be stored.')

      const payload: unknown = await stored.json().catch(() => null)
      const storageId =
        typeof payload === 'object' && payload !== null && typeof (payload as { storageId?: unknown }).storageId === 'string'
          ? (payload as { storageId: string }).storageId
          : undefined

      if (!storageId) throw new AdminRequestError('The file was stored without an ID.')

      return client.mutation(api.verificationEntries.m.attachUpload, {
        id: id as Id<'verificationEntries'>,
        contentType,
        name: file.name,
        size: file.size,
        storageId: storageId as Id<'_storage'>
      })
    },
    'Unable to attach the file.'
  )
}

/** Drops one uploaded file from an entry, and from storage with it. */
export function handleAdminVerificationEntryAttachmentRemove(
  request: Request,
  environment: AdminVerificationRouteEnvironment = {}
) {
  return withAdminConvexWrite(
    request,
    environment,
    async (client) => {
      const body = await readJsonBody(request)
      if (!body) throw new AdminRequestError('A valid JSON request body is required.')

      const id = readString(body.id)
      const storageId = readString(body.storageId)

      if (!id || !storageId) throw new AdminRequestError('id and storageId are both required.')

      return client.mutation(api.verificationEntries.m.removeUpload, {
        id: id as Id<'verificationEntries'>,
        storageId: storageId as Id<'_storage'>
      })
    },
    'Unable to remove the attachment.'
  )
}

/** Sends an entry's verification email through Convex, which owns the Resend call. */
export function handleAdminVerificationEntrySend(
  request: Request,
  environment: AdminVerificationRouteEnvironment = {}
) {
  return withAdminConvexWrite(
    request,
    environment,
    async (client) => {
      const body = await readJsonBody(request)
      if (!body) throw new AdminRequestError('A valid JSON request body is required.')

      const id = readString(body.id)
      if (!id) throw new AdminRequestError('A verification entry ID is required.')

      return client.action(api.verificationEntries.m.sendEmail, {
        id: id as Id<'verificationEntries'>,
        attachments: readStringArray(body.attachments),
        subject: readString(body.subject),
        body: readString(body.body)
      })
    },
    'Unable to send the verification email.'
  )
}
