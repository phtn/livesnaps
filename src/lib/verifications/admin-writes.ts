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

export interface SendVerificationEmailInput {
  id: string
  attachments?: string[]
  subject?: string
  body?: string
}

const VERIFICATION_ENTRIES_PATH = '/api/admin/verification-entries'
const VERIFICATION_ENTRY_SEND_PATH = '/api/admin/verification-entries/send'

const post = async <T>(path: string, payload: unknown, fallbackErrorMessage: string): Promise<T> => {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })

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

export const createVerificationEntry = <T>(input: CreateVerificationEntryInput): Promise<T> =>
  post<T>(VERIFICATION_ENTRIES_PATH, input, 'Unable to create the verification entry.')

export const sendVerificationEmail = <T>(input: SendVerificationEmailInput): Promise<T> =>
  post<T>(VERIFICATION_ENTRY_SEND_PATH, input, 'Unable to send the verification email.')
