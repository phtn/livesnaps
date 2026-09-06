import { v } from 'convex/values'
import { VERIFICATION_ENTRY_STATUS_VALUES } from '../../src/lib/verifications/entries'

export const verificationEntryStatusSchema = v.union(
  ...VERIFICATION_ENTRY_STATUS_VALUES.map((status) => v.literal(status))
)

export const verificationUploadSchema = v.object({
  contentType: v.string(),
  /** The name as it left the operator's device; it becomes the filename. */
  name: v.string(),
  size: v.number(),
  storageId: v.id('_storage'),
  uploadedAt: v.number()
})

export const verificationEntrySchema = v.object({
  applicant: v.string(),
  /**
   * The applicant's and the sender's avatars as they stood when the entry was
   * created. Both are snapshots rather than references: the entry is a record
   * of a send, so it keeps the faces that were on it at the time.
   */
  applicantImageUrl: v.optional(v.string()),
  ccEmailAddress: v.optional(v.string()),
  createdAt: v.number(),
  emailFromAddress: v.string(),
  emailToAddress: v.string(),
  attachments: v.optional(v.array(v.string())),
  plateNumber: v.string(),
  /**
   * Files the operator browsed from their own device, held in Convex storage
   * until the email goes out. `attachments` holds names the server knows how
   * to assemble; these are bytes it could not have produced on its own.
   */
  uploads: v.optional(v.array(verificationUploadSchema)),
  senderImageUrl: v.optional(v.string()),
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
export type VerificationUpload = typeof verificationUploadSchema.type
export type VerificationEntryStatus = typeof verificationEntryStatusSchema.type
