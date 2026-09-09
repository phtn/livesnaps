/**
 * The write half of the admin verification surface.
 *
 * Reads poll the Worker (see `use-admin-list`) because the admin origin holds
 * only a session cookie and cannot mint a Convex identity in the browser. The
 * same constraint applies to writes, so these post to the Worker rather than
 * calling `useMutation`/`useAction` from `convex/react`.
 */

export interface CreateVerificationEntryInput {
  applicant: string
  attachments?: string[]
  ccEmailAddress?: string
  emailToAddress: string
  plateNumber: string
  uploadId: string
}

export interface RemoveVerificationAttachmentInput {
  id: string
  storageId: string
}

export interface SendVerificationEmailInput {
  id: string
  emailToAddress?: string
  attachments?: string[]
  subject?: string
  body?: string
}

const VERIFICATION_ENTRIES_PATH = '/api/admin/verification-entries'
const VERIFICATION_ENTRY_SEND_PATH = '/api/admin/verification-entries/send'
const VERIFICATION_ENTRY_ACTIVE_PATH = '/api/admin/verification-entries/active'
const VERIFICATION_ENTRY_ATTACHMENTS_PATH = '/api/admin/verification-entries/attachments'
const VERIFICATION_ENTRY_ATTACHMENT_REMOVE_PATH = '/api/admin/verification-entries/attachments/remove'

const send = async <T>(path: string, init: RequestInit, fallbackErrorMessage: string): Promise<T> => {
  const response = await fetch(path, { credentials: 'same-origin', method: 'POST', ...init })

  const parsed: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof parsed === 'object' && parsed !== null && typeof (parsed as { error?: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : fallbackErrorMessage

    throw new Error(message)
  }

  return parsed as T
}

const post = <T>(path: string, payload: unknown, fallbackErrorMessage: string): Promise<T> =>
  send<T>(
    path,
    { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) },
    fallbackErrorMessage
  )

export const createVerificationEntry = <T>(input: CreateVerificationEntryInput): Promise<T> =>
  post<T>(VERIFICATION_ENTRIES_PATH, input, 'Unable to create the verification entry.')

export const sendVerificationEmail = <T>(input: SendVerificationEmailInput): Promise<T> =>
  post<T>(VERIFICATION_ENTRY_SEND_PATH, input, 'Unable to send the verification email.')

export const activateVerificationEntry = <T>(id: string): Promise<T> =>
  post<T>(VERIFICATION_ENTRY_ACTIVE_PATH, { id }, 'Unable to activate the verification entry.')

/**
 * Posts one browsed file. `content-type` is left unset on purpose: the browser
 * writes the multipart boundary into it, and naming the type here would strip
 * that and leave the Worker unable to parse the body.
 */
export const uploadVerificationAttachment = <T>(id: string, file: File): Promise<T> => {
  const form = new FormData()
  form.append('id', id)
  form.append('file', file)

  return send<T>(VERIFICATION_ENTRY_ATTACHMENTS_PATH, { body: form }, 'Unable to attach the file.')
}

export const removeVerificationAttachment = <T>(input: RemoveVerificationAttachmentInput): Promise<T> =>
  post<T>(VERIFICATION_ENTRY_ATTACHMENT_REMOVE_PATH, input, 'Unable to remove the attachment.')
