import type { DeviceLocation } from '@/lib/location/type'
export type SnapSessionEndStatus = 'completed' | 'cancelled' | 'invalidated'

type EndSnapSessionProps = {
  keepalive?: boolean
  lastLocation: DeviceLocation | null
  plateNumber?: string
  reason?: string
  status: SnapSessionEndStatus
  uploadId: string
}

export const endSnapSession = ({
  keepalive = false,
  lastLocation,
  plateNumber,
  reason,
  status,
  uploadId
}: EndSnapSessionProps) =>
  fetch('/api/snaps/session', {
    method: 'PATCH',
    headers: {
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
