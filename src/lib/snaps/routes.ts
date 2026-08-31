import type { Id } from '../../../convex/_generated/dataModel'

const SNAP_SUBMISSION_ROUTE_PATTERN = /^\/snaps\/([^/]+)\/?$/

export const getSnapDetailPath = (snapId: Id<'snaps'>) => `/admin/snaps/${encodeURIComponent(snapId)}`

export const getApplicantProfilePath = (snapId: Id<'snaps'>) => `/applicants/${encodeURIComponent(snapId)}`

export const getSnapSubmissionPath = (snapId: Id<'snaps'>) => `/snaps/${encodeURIComponent(snapId)}`

export const getSnapSubmissionRouteId = (pathname: string) => {
  const encodedSnapId = SNAP_SUBMISSION_ROUTE_PATTERN.exec(pathname)?.[1]

  if (!encodedSnapId) return null

  try {
    return decodeURIComponent(encodedSnapId)
  } catch {
    return null
  }
}

export const getSnapSubmissionPhotoPath = (snapId: Id<'snaps'>, slot: number) =>
  `/api/snaps/${encodeURIComponent(snapId)}/photos/${encodeURIComponent(slot)}`
