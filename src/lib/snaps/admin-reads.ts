/**
 * The read half of the admin snap surface, for the one snap a row action needs.
 *
 * The browser on the admin origin holds only a session cookie and has no
 * Firebase client identity, so `convexClient.query(...)` there reaches Convex
 * unauthenticated and `requireAdmin` refuses it. The Worker re-mints an ID
 * token per request, so the detail read goes through it like the list does.
 */

import type { Doc } from '../../../convex/_generated/dataModel'

const ADMIN_SNAP_DETAIL_PATH = '/api/admin/snaps'

export async function fetchAdminSnap(snapId: string): Promise<Doc<'snaps'>> {
  const response = await fetch(`${ADMIN_SNAP_DETAIL_PATH}/${encodeURIComponent(snapId)}`, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' }
  })

  const parsed: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof parsed === 'object' && parsed !== null && typeof (parsed as { error?: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : 'Unable to load the snap.'

    throw new Error(message)
  }

  // A snap id that no longer resolves comes back as a successful `null` rather
  // than an error, so the missing case is named here instead of downstream.
  if (parsed === null) throw new Error('Snap not found.')

  return parsed as Doc<'snaps'>
}
