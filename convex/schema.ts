import { defineSchema, defineTable } from 'convex/server'
import { accountMemberSchema } from './accountMembers/d'
import { accountSchema } from './accounts/d'
import { adminSchema } from './admin/d'
import { resendWebhookEventSchema } from './resendWebhooks/d'
import { snapSettingsSchema } from './snapSettings/d'
import { snapValidator } from './snaps/d'
import { userValidator } from './users/v'
import { verificationEntrySchema } from './verificationEntries/d'
import { visionLogSchema } from './vision_logs/d'

export default defineSchema({
  accounts: defineTable(accountSchema)
    .index('by_slug', ['slug'])
    .index('by_createdAt', ['createdAt'])
    .index('by_status_and_createdAt', ['status', 'createdAt'])
    .index('by_ownerTokenIdentifier_and_createdAt', ['ownerTokenIdentifier', 'createdAt'])
    .index('by_primaryContact_tokenIdentifier', ['primaryContact.tokenIdentifier'])
    .index('by_primaryContact_email', ['primaryContact.email']),
  accountMembers: defineTable(accountMemberSchema)
    .index('by_accountId_and_status', ['accountId', 'status'])
    .index('by_accountId_and_role', ['accountId', 'role'])
    .index('by_accountId_and_email', ['accountId', 'email'])
    .index('by_accountId_and_tokenIdentifier', ['accountId', 'tokenIdentifier'])
    .index('by_tokenIdentifier_and_status', ['tokenIdentifier', 'status'])
    .index('by_email_and_status', ['email', 'status']),
  admin: defineTable(adminSchema).index('by_identifier', ['identifier']),
  users: defineTable(userValidator)
    .index('by_tokenIdentifier', ['tokenIdentifier'])
    .index('by_firebaseUid', ['firebaseUid']),
  snaps: defineTable(snapValidator)
    .index('by_applicant_token_identifier_and_session_started_at', [
      'metadata.applicant_token_identifier',
      'location_session.started_at'
    ])
    .index('by_location_session_status_and_started_at', ['location_session.status', 'location_session.started_at'])
    .index('by_metadata_upload_id', ['metadata.upload_id'])
    .index('by_updated_at', ['updated_at']),
  snapSettings: defineTable(snapSettingsSchema).index('by_key', ['key']),
  verificationEntries: defineTable(verificationEntrySchema)
    .index('by_createdAt', ['createdAt'])
    .index('by_status_and_createdAt', ['status', 'createdAt'])
    .index('by_senderTokenIdentifier_and_createdAt', ['senderTokenIdentifier', 'createdAt'])
    .index('by_uploadId', ['uploadId']),
  vision_logs: defineTable(visionLogSchema).index('by_upload_id', ['upload_id']).index('by_createdAt', ['createdAt']),
  resendWebhooks: defineTable(resendWebhookEventSchema)
    .index('by_webhookId', ['webhookId'])
    .index('by_receivedAt', ['receivedAt'])
    .index('by_category_and_receivedAt', ['category', 'receivedAt'])
    .index('by_eventType_and_receivedAt', ['eventType', 'receivedAt'])
})
