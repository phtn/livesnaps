import { DEFAULT_VERIFICATION_ATTACHMENTS } from '@/lib/verifications/entries'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { type AdminConvexEnvironment, AdminRequestError, withAdminConvex, withAdminConvexWrite } from './admin-convex'

export type AdminVerificationRouteEnvironment = AdminConvexEnvironment

const VERIFICATION_ENTRY_LIST_LIMIT = 250

export function handleAdminVerificationEntryList(
  request: Request,
  environment: AdminVerificationRouteEnvironment = {}
) {
  const limit = Number(new URL(request.url).searchParams.get('limit'))

  return withAdminConvex(
    request,
    environment,
    (client) =>
      client.query(api.verificationEntries.q.listAllForAdmin, {
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
