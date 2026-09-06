import { useForm } from '@octanejs/tanstack-form'
import type { AdminSnapListItem } from '@/lib/snaps/admin-photo-types'
import type { CreateVerificationEntryInput } from '@/lib/verifications/admin-writes'
import {
  DEFAULT_VERIFICATION_ATTACHMENTS,
  isVerificationEmailAddress,
  VERIFICATION_APPLICANT_MAX_LENGTH
} from '@/lib/verifications/entries'

/**
 * Every value the create-verification form owns. The snap is held as an id
 * rather than as the record itself, so the form state stays serialisable and
 * the snap is resolved from the list that is already in memory.
 */
export interface VerificationEntryFormValues {
  snapId: string
  emailToAddress: string
  ccEmailAddress: string
  attachments: string[]
}

/** The fields a plain email control can bind, so one component covers both. */
export type VerificationEntryEmailField = 'emailToAddress' | 'ccEmailAddress'

export const VERIFICATION_ENTRY_FORM_DEFAULTS: VerificationEntryFormValues = {
  snapId: '',
  emailToAddress: '',
  ccEmailAddress: '',
  attachments: [...DEFAULT_VERIFICATION_ATTACHMENTS]
}

/** A fresh copy per reset, so one form never hands its array to the next. */
export const verificationEntryFormDefaults = (): VerificationEntryFormValues => ({
  ...VERIFICATION_ENTRY_FORM_DEFAULTS,
  attachments: [...DEFAULT_VERIFICATION_ATTACHMENTS]
})

/**
 * Validates the whole form in one pass. Returning the errors keyed by field is
 * the shape TanStack Form spreads onto the individual fields, so the same
 * function drives both the per-field messages and the submit button.
 *
 * Only form-owned values are checked here. Whether the *snap* carries a usable
 * plate and applicant is decided by `toCreateVerificationEntryInput`, because
 * that is a property of the record rather than of anything the operator typed.
 */
export function validateVerificationEntryForm(values: VerificationEntryFormValues) {
  const fields: Partial<Record<keyof VerificationEntryFormValues, string>> = {}

  if (values.snapId.trim().length === 0) fields.snapId = 'Select a snap to verify.'

  const emailToAddress = values.emailToAddress.trim()
  if (emailToAddress.length === 0) fields.emailToAddress = 'A recipient email is required.'
  else if (!isVerificationEmailAddress(emailToAddress)) fields.emailToAddress = 'Enter a valid email address.'

  const ccEmailAddress = values.ccEmailAddress.trim()
  if (ccEmailAddress.length > 0 && !isVerificationEmailAddress(ccEmailAddress))
    fields.ccEmailAddress = 'Enter a valid email address.'

  if (values.attachments.length === 0) fields.attachments = 'Include at least one attachment.'

  return Object.keys(fields).length > 0 ? { fields } : undefined
}

/**
 * Folds the typed values and the selected snap into the Worker's payload. A
 * snap that cannot back an entry throws rather than returning a partial input,
 * so the failure lands in the form's own error map alongside a server refusal.
 */
export function toCreateVerificationEntryInput(
  values: VerificationEntryFormValues,
  snap: AdminSnapListItem
): CreateVerificationEntryInput {
  const plateNumber = snap.plateNumber.trim()
  if (plateNumber.length === 0) throw new Error('The selected snap has no plate number.')

  const applicant = (snap.fullName.trim() || snap.email.trim()).slice(0, VERIFICATION_APPLICANT_MAX_LENGTH)
  if (applicant.length === 0) throw new Error('The selected snap has no applicant name or email.')

  const ccEmailAddress = values.ccEmailAddress.trim()

  return {
    applicant,
    attachments: [...values.attachments],
    ...(ccEmailAddress.length > 0 ? { ccEmailAddress } : {}),
    emailToAddress: values.emailToAddress.trim(),
    plateNumber,
    uploadId: snap.uploadId
  }
}

/** Validation errors are typed as `unknown`, so only real strings are shown. */
export const readValidationMessage = (errors: ReadonlyArray<unknown>) => {
  const message = errors.find((error) => typeof error === 'string' && error.length > 0)
  return typeof message === 'string' ? message : null
}

export interface UseVerificationEntryFormOptions {
  onSubmit: (values: VerificationEntryFormValues) => Promise<void>
  /** Mirrors a failed submission out to a toast; the banner reads the error map. */
  onFailure?: (message: string) => void
}

/**
 * Owns the create-verification form. A failed submission is written back into
 * the form's own error map rather than into component state, so the button,
 * the banner, and the field messages all read from one place.
 */
export function useVerificationEntryForm({ onSubmit, onFailure }: UseVerificationEntryFormOptions) {
  return useForm({
    defaultValues: verificationEntryFormDefaults(),
    validators: {
      onChange: ({ value }) => validateVerificationEntryForm(value)
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await onSubmit(value)
      } catch (error: unknown) {
        const message =
          error instanceof Error && error.message.length > 0
            ? error.message
            : 'Unable to create the verification entry.'
        formApi.setErrorMap({ onSubmit: { form: message, fields: {} } })
        onFailure?.(message)
      }
    }
  })
}

export type VerificationEntryForm = ReturnType<typeof useVerificationEntryForm>
