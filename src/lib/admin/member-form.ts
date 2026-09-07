import { useForm } from '@octanejs/tanstack-form'
import { isAccountEmailAddress } from '@/lib/accounts/accounts'
import {
  ACCOUNT_MEMBER_NAME_MAX_LENGTH,
  ACCOUNT_MEMBER_TITLE_MAX_LENGTH,
  type AccountMemberRole,
  DEFAULT_ACCOUNT_MEMBER_ROLE
} from '@/lib/accounts/members'
import type { InviteMemberInput } from '@/lib/admin/account-members'
import { readErrorMessage } from '@/lib/citadel/errors'

/** Every value the invite form owns. */
export interface MemberFormValues {
  email: string
  name: string
  title: string
  role: AccountMemberRole
}

/** The fields a plain text control can bind, so one component covers them all. */
export type MemberTextField = Exclude<keyof MemberFormValues, 'role'>

export const MEMBER_FORM_DEFAULTS: MemberFormValues = {
  email: '',
  name: '',
  title: '',
  role: DEFAULT_ACCOUNT_MEMBER_ROLE
}

/**
 * Validates the whole form in one pass. Returning the errors keyed by field is
 * the shape TanStack Form spreads onto the individual fields, so the same
 * function drives both the per-field messages and the submit button.
 */
export function validateMemberForm(values: MemberFormValues) {
  const fields: Partial<Record<MemberTextField, string>> = {}

  const email = values.email.trim()
  if (email.length === 0) fields.email = 'An email address is required.'
  else if (!isAccountEmailAddress(email)) fields.email = 'Enter a valid email address.'

  if (values.name.trim().length > ACCOUNT_MEMBER_NAME_MAX_LENGTH)
    fields.name = `Keep this under ${ACCOUNT_MEMBER_NAME_MAX_LENGTH} characters.`

  if (values.title.trim().length > ACCOUNT_MEMBER_TITLE_MAX_LENGTH)
    fields.title = `Keep this under ${ACCOUNT_MEMBER_TITLE_MAX_LENGTH} characters.`

  return Object.keys(fields).length > 0 ? { fields } : undefined
}

const trimmed = (value: string) => {
  const next = value.trim()
  return next.length > 0 ? next : undefined
}

export function toInviteMemberInput(values: MemberFormValues): InviteMemberInput {
  return {
    email: values.email.trim(),
    name: trimmed(values.name),
    title: trimmed(values.title),
    role: values.role
  }
}

/** Validation errors are typed as `unknown`, so only real strings are shown. */
export const readValidationMessage = (errors: ReadonlyArray<unknown>) => {
  const message = errors.find((error) => typeof error === 'string' && error.length > 0)
  return typeof message === 'string' ? message : null
}

export interface UseMemberFormOptions {
  onSubmit: (input: InviteMemberInput) => Promise<void>
}

/**
 * Owns the invite-member form. A failed submission is written back into the
 * form's own error map rather than into component state, so the button, the
 * banner, and the field messages all read from one place.
 */
export function useMemberForm({ onSubmit }: UseMemberFormOptions) {
  return useForm({
    defaultValues: MEMBER_FORM_DEFAULTS,
    validators: {
      onChange: ({ value }) => validateMemberForm(value)
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await onSubmit(toInviteMemberInput(value))
      } catch (error: unknown) {
        formApi.setErrorMap({
          onSubmit: { form: readErrorMessage(error, 'Could not invite this member.'), fields: {} }
        })
      }
    }
  })
}

export type MemberForm = ReturnType<typeof useMemberForm>
