import type { Context } from '@octanejs/rsbuild-plugin'
import { api } from '../../convex/_generated/api'
import { getIpinfoLiteData, getClientIpAddress, IpinfoError } from '../lib/ipinfo/server'
import { parseDeviceLocation } from '../lib/location/type'
import { MapboxGeocodingError, reverseGeocodeWithMapbox } from '../lib/location/mapbox-server'
import { authenticateRequest, createConvexClient, RequestError } from './convex'

const SESSION_STATUSES = ['completed', 'cancelled', 'invalidated'] as const
type SessionStatus = (typeof SESSION_STATUSES)[number]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' }
  })

const readJson = async (request: Request): Promise<Record<string, unknown>> => {
  const value: unknown = await request.json().catch(() => null)
  if (!isRecord(value)) throw new RequestError(400, 'The location verification request is invalid.')
  return value
}

const readRequiredString = (body: Record<string, unknown>, field: string) => {
  const value = body[field]
  if (typeof value !== 'string' || !value.trim()) {
    throw new RequestError(400, `The ${field} field is required.`)
  }
  return value.trim()
}

const readOptionalString = (body: Record<string, unknown>, field: string) => {
  const value = body[field]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new RequestError(400, `The ${field} field is invalid.`)
  return value.trim() || undefined
}

const readLocation = (body: Record<string, unknown>, field: string) => {
  const location = parseDeviceLocation(body[field])
  if (!location) throw new RequestError(400, 'The device location is invalid.')
  return location
}

const readStatus = (body: Record<string, unknown>): SessionStatus => {
  const status = body.status
  if (typeof status !== 'string' || !SESSION_STATUSES.includes(status as SessionStatus)) {
    throw new RequestError(400, 'The location verification status is invalid.')
  }
  return status as SessionStatus
}

async function startSnapSession(request: Request) {
  const { client } = await authenticateRequest(request)
  const body = await readJson(request)
  const uploadId = readRequiredString(body, 'upload_id')
  const initialLocation = readLocation(body, 'initial_location')
  const clientIp = getClientIpAddress(request.headers)

  if (!clientIp) {
    throw new RequestError(400, 'Unable to determine your network location. Please try again.')
  }

  const [address, ipinfo] = await Promise.all([
    reverseGeocodeWithMapbox(initialLocation),
    getIpinfoLiteData(clientIp)
  ])

  await client.mutation(api.snaps.m.startSession, {
    address,
    initial_location: initialLocation,
    ipinfo,
    upload_id: uploadId
  })

  return json({ ok: true })
}

async function updateSnapSession(request: Request) {
  const body = await readJson(request)
  const lastLocationValue = body.last_location
  const lastLocation = lastLocationValue === undefined ? undefined : readLocation(body, 'last_location')
  const uploadId = readRequiredString(body, 'upload_id')
  const status = readStatus(body)
  const plateNumber = readOptionalString(body, 'plate_number')
  const reason = readOptionalString(body, 'reason')

  const client = createConvexClient()
  await client.mutation(api.snaps.m.endSession, {
    ...(lastLocation ? { last_location: lastLocation } : {}),
    ...(plateNumber ? { plate_number: plateNumber } : {}),
    ...(reason ? { reason } : {}),
    status,
    upload_id: uploadId
  })

  return json({ ok: true })
}

export async function handleSnapSessionRequest(request: Request) {
  try {
    if (request.method === 'POST') return await startSnapSession(request)
    if (request.method === 'PATCH') return await updateSnapSession(request)
    return json({ error: 'Method not allowed.' }, 405)
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status)
    if (error instanceof MapboxGeocodingError || error instanceof IpinfoError) {
      return json({ error: error.message }, error.status >= 400 && error.status < 600 ? error.status : 503)
    }

    return json(
      { error: error instanceof Error ? error.message : 'Unable to start location verification.' },
      503
    )
  }
}

export async function handleSnapSession(context: Context) {
  return handleSnapSessionRequest(context.request)
}
