import type { DeviceLocation } from '@/lib/location/type'

const readApiError = async (response: Response, fallback: string) => {
  const result = (await response.json().catch(() => null)) as { error?: unknown } | null
  return typeof result?.error === 'string' ? result.error : fallback
}
export const createSnapSession = async (uploadId: string, initialLocation: DeviceLocation, idToken: string) => {
  const response = await fetch('/api/snaps/session', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      initial_location: initialLocation,
      upload_id: uploadId
    })
  })

  if (!response.ok) {
    throw new Error(await readApiError(response, 'Unable to start location verification.'))
  }
}
