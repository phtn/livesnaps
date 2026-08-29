import 'server-only'

import {
  getFirebaseCustomClaimsFromDecodedToken,
  hasFirebaseSnapAdminAccess
} from '@/lib/firebase/custom-claims'
import { getAppRootHostname } from '@/lib/routing/admin-subdomain'
import { cache } from 'react'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getFirebaseAdminAuth } from './admin'
import { firebaseSessionCookieName } from './session'

type VerifiedSession = {
  customClaims: ReturnType<typeof getFirebaseCustomClaimsFromDecodedToken>
  decodedToken: DecodedIdToken
}

async function buildAppHomeUrl() {
  const headerStore = await headers()
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host')

  if (!host) {
    return '/'
  }

  const protocol = headerStore.get('x-forwarded-proto') ?? 'http'
  const appUrl = new URL(`${protocol}://${host}`)
  appUrl.hostname = getAppRootHostname(appUrl.hostname)
  appUrl.pathname = '/'
  appUrl.search = ''
  appUrl.hash = ''
  return appUrl.toString()
}

export const getVerifiedSession = cache(async (): Promise<VerifiedSession | null> => {
  const auth = getFirebaseAdminAuth()

  if (!auth) {
    return null
  }

  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(firebaseSessionCookieName)?.value

  if (!sessionCookie) {
    return null
  }

  try {
    const decodedToken = await auth.verifySessionCookie(sessionCookie, true)
    const customClaims = getFirebaseCustomClaimsFromDecodedToken(decodedToken)

    return {
      customClaims,
      decodedToken
    }
  } catch {
    return null
  }
})

export const getVerifiedAdminSession = cache(async (): Promise<VerifiedSession | null> => {
  const session = await getVerifiedSession()

  return session?.customClaims.admin === true ? session : null
})

export const getVerifiedSnapAdminSession = cache(async (): Promise<VerifiedSession | null> => {
  const session = await getVerifiedSession()

  return session && hasFirebaseSnapAdminAccess(session.customClaims) ? session : null
})

export async function requireAdminSession() {
  const session = await getVerifiedAdminSession()

  if (!session) {
    redirect(await buildAppHomeUrl())
  }

  return session
}

export async function requireSnapAdminSession() {
  const session = await getVerifiedSnapAdminSession()

  if (!session) {
    redirect(await buildAppHomeUrl())
  }

  return session
}
