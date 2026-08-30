import { v } from 'convex/values'
import { VERIFICATION_ENTRY_STATUS_VALUES } from '../../src/lib/verifications/entries'

export const verificationEntryStatusSchema = v.union(
  ...VERIFICATION_ENTRY_STATUS_VALUES.map((status) => v.literal(status))
)

export const verificationEntrySchema = v.object({
  applicant: v.string(),
  ccEmailAddress: v.optional(v.string()),
  createdAt: v.number(),
  emailFromAddress: v.string(),
  emailToAddress: v.string(),
  attachments: v.optional(v.array(v.string())),
  plateNumber: v.string(),
  senderName: v.string(),
  senderTokenIdentifier: v.string(),
  senderUid: v.string(),
  status: verificationEntryStatusSchema,
  updatedAt: v.number(),
  uploadId: v.string()
})

export const verificationEntryDocumentSchema = verificationEntrySchema.extend({
  _id: v.id('verificationEntries'),
  _creationTime: v.number()
})

export const createVerificationEntrySchema = verificationEntrySchema.pick(
  'applicant',
  'attachments',
  'ccEmailAddress',
  'emailToAddress',
  'plateNumber',
  'uploadId'
)

export type VerificationEntry = typeof verificationEntrySchema.type
export type VerificationEntryStatus = typeof verificationEntryStatusSchema.type
