import { defineSchema, defineTable } from 'convex/server'
import { adminSchema } from './admin/d'
import { snapValidator } from './snaps/d'
import { snapSettingsSchema } from './snapSettings/d'
import { userValidator } from './users/v'
import { verificationEntrySchema } from './verificationEntries/d'

export default defineSchema({
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
    .index('by_uploadId', ['uploadId'])
})
