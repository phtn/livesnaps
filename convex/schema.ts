import { defineSchema, defineTable } from 'convex/server'
import { snapValidator } from './snaps/d'
import { userValidator } from './users/v'

export default defineSchema({
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
    .index('by_updated_at', ['updated_at'])
})
