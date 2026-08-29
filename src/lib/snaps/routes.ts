import type { Id } from '../../../convex/_generated/dataModel'

export const getSnapDetailPath = (proofId: Id<'snaps'>) => `/l/snaps/${encodeURIComponent(proofId)}`

export const getApplicantProfilePath = (proofId: Id<'snaps'>) => `/l/applicants/${encodeURIComponent(proofId)}`

export const getSnapSubmissionPath = (proofId: Id<'snaps'>) => `/p/submissions/${encodeURIComponent(proofId)}`

export const getSnapsubmissionPhotoPath = (proofId: Id<'snaps'>, slot: number) =>
  `/api/snaps/${encodeURIComponent(proofId)}/photos/${encodeURIComponent(slot)}`
