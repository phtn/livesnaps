export const VERIFICATION_ENTRY_STATUS_VALUES = ['draft', 'active', 'submitted', 'cancelled', 'failed'] as const

export type VerificationEntryStatus = (typeof VERIFICATION_ENTRY_STATUS_VALUES)[number]

export const DEFAULT_VERIFICATION_ATTACHMENTS = ['photos', 'full report'] as const

export const VERIFICATION_APPLICANT_MAX_LENGTH = 120
export const VERIFICATION_EMAIL_MAX_LENGTH = 320

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const isVerificationEmailAddress = (value: string) =>
  value.length <= VERIFICATION_EMAIL_MAX_LENGTH && EMAIL_ADDRESS_PATTERN.test(value)
