import type { DeviceLocation } from '@/lib/location/type'
import { auth } from '@/lib/firebase'
export type SnapSessionEndStatus = 'completed' | 'cancelled' | 'invalidated'

type EndSnapSessionProps = {
  keepalive?: boolean
  lastLocation: DeviceLocation | null
  plateNumber?: string
  reason?: string
  status: SnapSessionEndStatus
  uploadId: string
}

export const endSnapSession = async ({
  keepalive = false,
  lastLocation,
  plateNumber,
  reason,
  status,
  uploadId
}: EndSnapSessionProps) => {
  const user = auth?.currentUser
  if (!user) throw new Error('Sign in before updating this submission.')
  const idToken = await user.getIdToken()
  return fetch('/api/snaps/session', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ...(lastLocation ? { last_location: lastLocation } : {}),
      ...(plateNumber ? { plate_number: plateNumber } : {}),
      ...(reason ? { reason } : {}),
      status,
      upload_id: uploadId
    }),
    keepalive
  })
}
