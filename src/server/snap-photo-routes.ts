import { api } from '../../convex/_generated/api'
import {
  deleteR2Object,
  getR2Object,
  putR2Object,
  type R2Config
} from '../lib/r2/server'
import { parseDeviceLocation } from '../lib/location/type'
import {
  buildSnapObjectKey,
  getSnapSlot,
  isSnapCaptureId,
  isSnapObjectKey,
  isSnapUploadId,
  SNAP_IMAGE_MAX_BYTES,
  type SnapSlotIndex
} from '../lib/r2/snap-images'
import { authenticateReadRequest, authenticateRequest, RequestError } from './convex'

export interface SnapPhotoRouteEnvironment {
  convexUrl?: string
  r2AccountId?: string
  r2AccessKeyId?: string
  r2SecretAccessKey?: string
  r2Bucket?: string
}

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' }
  })

const readFormData = async (request: Request) => {
  const formData = await request.formData().catch(() => null)
  if (!formData) throw new RequestError(400, 'The proof photo request is invalid.')
  return formData
}

const readRequiredString = (formData: FormData, field: string) => {
  const value = formData.get(field)
  if (typeof value !== 'string' || !value.trim()) {
    throw new RequestError(400, `The ${field} field is required.`)
  }
  return value.trim()
}

const readRequiredBoolean = (formData: FormData, field: string) => {
  const value = readRequiredString(formData, field)
  if (value === 'true') return true
  if (value === 'false') return false
  throw new RequestError(400, `The ${field} field is invalid.`)
}

const readRequiredInteger = (formData: FormData, field: string) => {
  const value = Number(readRequiredString(formData, field))
  if (!Number.isSafeInteger(value)) {
    throw new RequestError(400, `The ${field} field is invalid.`)
  }
  return value
}

const readLocation = (formData: FormData) => {
  const value = readRequiredString(formData, 'location')

  try {
    const location = parseDeviceLocation(JSON.parse(value) as unknown)
    if (!location) throw new Error('invalid')
    return location
  } catch {
    throw new RequestError(400, 'The device location is invalid.')
  }
}

const getR2Environment = (environment: SnapPhotoRouteEnvironment): Partial<R2Config> => ({
  accountId: environment.r2AccountId,
  accessKeyId: environment.r2AccessKeyId,
  secretAccessKey: environment.r2SecretAccessKey,
  bucket: environment.r2Bucket
})

async function saveSnapPhoto(request: Request, environment: SnapPhotoRouteEnvironment) {
  const { client } = await authenticateRequest(request, environment.convexUrl)
  const formData = await readFormData(request)
  const uploadId = readRequiredString(formData, 'uploadId')
  const captureId = readRequiredString(formData, 'captureId')
  const capturedAt = readRequiredInteger(formData, 'capturedAt')
  const isRetake = readRequiredBoolean(formData, 'isRetake')
  const slotIndex = readRequiredInteger(formData, 'slot')
  const location = readLocation(formData)
  const file = formData.get('file')

  if (!isSnapUploadId(uploadId)) throw new RequestError(400, 'The upload ID is invalid.')
  if (!isSnapCaptureId(captureId)) throw new RequestError(400, 'The capture ID is invalid.')

  const slot = getSnapSlot(slotIndex)
  if (!slot) throw new RequestError(400, 'The photo slot is invalid.')

  if (!(file instanceof File) || file.size < 1) {
    throw new RequestError(400, 'A proof photo is required.')
  }

  if (file.size > SNAP_IMAGE_MAX_BYTES) {
    throw new RequestError(413, 'The proof photo is too large.')
  }

  if (file.type !== 'image/webp') {
    throw new RequestError(415, 'Proof photos must be WebP images.')
  }

  const objectKey = buildSnapObjectKey(uploadId, slot.index as SnapSlotIndex, captureId)
  const r2 = getR2Environment(environment)
  const uploadResponse = await putR2Object({
    body: await file.arrayBuffer(),
    contentType: file.type,
    objectKey,
    r2
  })

  if (!uploadResponse.ok) {
    throw new Error(`R2 upload failed with status ${uploadResponse.status}.`)
  }

  try {
    await client.mutation(api.snaps.m.savePhoto, {
      is_retake: isRetake,
      location,
      photo: {
        capture_id: captureId,
        captured_at: capturedAt,
        content_type: 'image/webp',
        label: slot.label,
        location,
        r2_key: objectKey,
        size: file.size,
        slot: slot.index
      },
      upload_id: uploadId
    })
  } catch (error) {
    await deleteR2Object(objectKey, r2).catch(() => undefined)
    throw error
  }

  return json({ ok: true })
}

export async function handleSnapSubmissionPhotoPreviewRequest(
  request: Request,
  proofId: string,
  slot: number,
  environment: SnapPhotoRouteEnvironment = {}
) {
  try {
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)

    const { client } = authenticateReadRequest(request, environment.convexUrl)
    const objectKey = await client.query(api.snaps.q.getMinePhotoObjectKey, { proofId, slot })

    if (!objectKey || !isSnapObjectKey(objectKey)) {
      return json({ error: 'Photo not found.' }, 404)
    }

    const photoResponse = await getR2Object(objectKey, getR2Environment(environment))

    if (!photoResponse.ok || !photoResponse.body) {
      if (photoResponse.status === 404) return json({ error: 'Photo not found.' }, 404)
      throw new Error(`R2 photo fetch failed with status ${photoResponse.status}.`)
    }

    const contentType = photoResponse.headers.get('content-type') || 'image/webp'
    const contentLength = photoResponse.headers.get('content-length')
    const etag = photoResponse.headers.get('etag')

    return new Response(photoResponse.body, {
      headers: {
        'cache-control': 'private, max-age=86400',
        'content-type': contentType,
        ...(contentLength ? { 'content-length': contentLength } : {}),
        ...(etag ? { etag } : {})
      }
    })
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status)
    if (error instanceof Error && /unauthenticated|authentication/i.test(error.message)) {
      return json({ error: 'Your sign-in session has expired. Sign in again.' }, 401)
    }

    return json(
      { error: error instanceof Error ? error.message : 'Unable to load the proof image.' },
      503
    )
  }
}

export async function handleSnapPhotoRequest(
  request: Request,
  environment: SnapPhotoRouteEnvironment = {}
) {
  try {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    return await saveSnapPhoto(request, environment)
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status)

    return json(
      { error: error instanceof Error ? error.message : 'Unable to save the proof image.' },
      503
    )
  }
}
