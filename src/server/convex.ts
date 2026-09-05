import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'

export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'RequestError'
  }
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    throw new RequestError(401, 'Sign in with Google to access LiveSnaps.')
  }

  const token = authorization.slice('Bearer '.length).trim()
  if (!token) throw new RequestError(401, 'Your sign-in session is invalid.')
  return token
}

function getConvexUrl(configuredUrl?: string) {
  const url = configuredUrl?.trim() || process.env.CONVEX_URL?.trim() || process.env.PUBLIC_CONVEX_URL?.trim()
  if (!url) throw new Error('CONVEX_URL is not configured.')
  return url
}

export function createConvexClient(token?: string, convexUrl?: string) {
  return new ConvexHttpClient(getConvexUrl(convexUrl), {
    ...(token ? { auth: token } : {}),
    logger: false
  })
}

export function authenticateReadRequest(request: Request, convexUrl?: string) {
  return {
    client: createConvexClient(getBearerToken(request), convexUrl)
  }
}

export async function authenticateRequest(request: Request, convexUrl?: string) {
  const { client } = authenticateReadRequest(request, convexUrl)

  try {
    const userId = await client.mutation(api.users.m.ensureCurrent, {})
    return { client, userId }
  } catch (error) {
    if (error instanceof Error && /Unauthenticated|authentication/i.test(error.message)) {
      throw new RequestError(401, 'Your sign-in session has expired. Sign in again.')
    }
    throw error
  }
}
