import { isVerificationEmailAddress } from './entries'
export const MAX_RECIPIENT_DEFAULTS = 50
export interface RecipientDefaults {
  accountEmails: string[]
  memberEmails: string[]
  canManageAccount: boolean
}
export function normalizeRecipientDefaults(emails: string[]): string[] {
  if (emails.length > MAX_RECIPIENT_DEFAULTS) throw new Error(`Use at most ${MAX_RECIPIENT_DEFAULTS} recipient addresses.`)
  const normalized = emails.map(email => email.trim().toLowerCase())
  if (normalized.some(email => !isVerificationEmailAddress(email))) throw new Error('Enter one valid email address per line.')
  return [...new Set(normalized)]
}
export function recipientChoices(settings: RecipientDefaults | null) {
  return settings ? [...new Set([...settings.memberEmails, ...settings.accountEmails])] : []
}
export const parseRecipientDefaults = (text: string) => normalizeRecipientDefaults(text.split(/\n/).map(email => email.trim()).filter(Boolean))
