import { ConvexHttpClient } from 'convex/browser'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { getFirebaseSessionCookieDomain } from '@/lib/firebase-admin/session'
import { getHostnameFromHostHeader } from '@/lib/routing/admin-subdomain'
import { api } from '../../../convex/_generated/api'

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}
function toUndefinedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

export function buildFirebaseTokenIdentifier(decodedToken: DecodedIdToken) {
  return `${decodedToken.iss}|${decodedToken.sub}`
}

export async function syncFirebaseSessionIdentityToConvex(decodedToken: DecodedIdToken) {
  const convexUrl = process.env.CONVEX_URL?.trim()
  if (!convexUrl) throw new Error('CONVEX_URL is not configured.')

  const client = new ConvexHttpClient(convexUrl)
  await client.mutation(api.users.m.upsertByTokenIdentifier, {
    tokenIdentifier: buildFirebaseTokenIdentifier(decodedToken),
    subject: decodedToken.sub,
    issuer: decodedToken.iss,
    name: toUndefinedString(decodedToken.name),
    nickname: toNullableString(decodedToken.firebase?.sign_in_provider),
    preferredUsername: toNullableString(decodedToken.email),
    imageUrl: toUndefinedString(decodedToken.picture),
    email: toUndefinedString(decodedToken.email),
    phone: toNullableString(decodedToken.phone_number),
    emailVerified: typeof decodedToken.email_verified === 'boolean' ? decodedToken.email_verified : null,
    updatedAt:
      typeof decodedToken.firebase?.sign_in_time === 'number' ? decodedToken.firebase?.sign_in_time : Date.now(),
    createdAt:
      typeof decodedToken.firebase?.sign_in_time === 'number' ? decodedToken.firebase?.sign_in_time : Date.now(),
    firebaseUid: decodedToken.uid
  })
}

export function resolveFirebaseSessionCookieDomain(request: Request) {
  const requestHostname =
    getHostnameFromHostHeader(request.headers.get('x-forwarded-host') ?? request.headers.get('host')) ??
    new URL(request.url).hostname

  return getFirebaseSessionCookieDomain(requestHostname)
}
