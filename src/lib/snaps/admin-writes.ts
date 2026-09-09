import type { Id } from '../../../convex/_generated/dataModel'

export interface UpdateAdminSnapInput {
  snapId: Id<'snaps'>
  fullName: string
  plateNumber: string
  make: string
  model: string
  year: number
  mileage: number | null
  phone: string
}

export async function updateAdminSnap({ snapId, ...details }: UpdateAdminSnapInput): Promise<void> {
  const response = await fetch(`/api/admin/snaps/${encodeURIComponent(snapId)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(details)
  })
  const parsed: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      typeof parsed === 'object' && parsed !== null && typeof (parsed as { error?: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : 'Unable to update the snap.'
    throw new Error(message)
  }
}
