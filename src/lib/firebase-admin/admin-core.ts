import { cert, getApp, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app'
import { type Auth, getAuth, type ListUsersResult, type UserRecord } from 'firebase-admin/auth'
import { type FirebaseCustomClaims, isFirebaseCustomClaims } from './custom-claims'

type FirebaseServiceAccountInput = {
  project_id?: string
  projectId?: string
  client_email?: string
  clientEmail?: string
  private_key?: string
  privateKey?: string
}

let cachedAuth: Auth | null | undefined

function normalizePrivateKey(privateKey: string) {
  return privateKey.replace(/\\n/g, '\n')
}

function buildServiceAccount(
  projectId: string | undefined,
  clientEmail: string | undefined,
  privateKey: string | undefined
) {
  if (!projectId || !clientEmail || !privateKey) {
    return null
  }

  return {
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKey)
  }
}

function readServiceAccountFromJson(): ServiceAccount | null {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim()

  if (!rawServiceAccount?.startsWith('{')) {
    return null
  }

  try {
    const parsed = JSON.parse(rawServiceAccount) as FirebaseServiceAccountInput
    return (
      buildServiceAccount(
        parsed.project_id ?? parsed.projectId ?? process.env.FIREBASE_PROJECT_ID,
        parsed.client_email ?? parsed.clientEmail ?? process.env.FIREBASE_CLIENT_EMAIL,
        parsed.private_key ?? parsed.privateKey ?? process.env.FIREBASE_PRIVATE_KEY
      ) ?? null
    )
  } catch {
    return null
  }
}

function readServiceAccountFromEnv(): ServiceAccount | null {
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const rawServiceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  const privateKey =
    rawServiceAccountKey && rawServiceAccountKey.includes('BEGIN PRIVATE KEY')
      ? rawServiceAccountKey
      : process.env.FIREBASE_PRIVATE_KEY

  const serviceAccount = buildServiceAccount(projectId, clientEmail, privateKey)

  if (serviceAccount) {
    return serviceAccount
  }

  return null
}

function readServiceAccount(): ServiceAccount | null {
  return readServiceAccountFromJson() ?? readServiceAccountFromEnv()
}

function requireFirebaseAdminAuth(): Auth {
  const auth = getFirebaseAdminAuth()

  if (!auth) {
    throw new Error('Firebase Admin credentials are not configured.')
  }

  return auth
}

function normalizeRequiredString(value: string, label: string) {
  const normalized = value.trim()

  if (normalized.length === 0) {
    throw new Error(`${label} is required.`)
  }

  return normalized
}

function normalizeExistingCustomClaims(customClaims: UserRecord['customClaims']): FirebaseCustomClaims {
  return isFirebaseCustomClaims(customClaims) ? { ...customClaims } : {}
}

export function getFirebaseAdminAuth(): Auth | null {
  if (cachedAuth !== undefined) {
    return cachedAuth
  }

  if (getApps().length > 0) {
    cachedAuth = getAuth(getApp())
    return cachedAuth
  }

  const serviceAccount = readServiceAccount()

  if (!serviceAccount) {
    cachedAuth = null
    return null
  }

  const app = initializeApp({
    credential: cert(serviceAccount)
  })

  cachedAuth = getAuth(app)
  return cachedAuth
}

export async function getFirebaseUserByUid(uid: string): Promise<UserRecord> {
  return await requireFirebaseAdminAuth().getUser(normalizeRequiredString(uid, 'Firebase uid'))
}

export async function getFirebaseUserByEmail(email: string): Promise<UserRecord> {
  return await requireFirebaseAdminAuth().getUserByEmail(normalizeRequiredString(email, 'Firebase email'))
}

export async function getFirebaseUser({
  uid,
  email
}: {
  uid?: string | null
  email?: string | null
}): Promise<UserRecord> {
  if (uid) {
    return await getFirebaseUserByUid(uid)
  }

  if (email) {
    return await getFirebaseUserByEmail(email)
  }

  throw new Error('Provide either a Firebase uid or email.')
}

export async function listFirebaseUsers(maxResults: number, pageToken?: string): Promise<ListUsersResult> {
  return await requireFirebaseAdminAuth().listUsers(maxResults, pageToken)
}

export async function setFirebaseCustomUserClaims(
  uid: string,
  customClaims: FirebaseCustomClaims | null
): Promise<FirebaseCustomClaims | null> {
  const normalizedUid = normalizeRequiredString(uid, 'Firebase uid')
  await requireFirebaseAdminAuth().setCustomUserClaims(normalizedUid, customClaims)
  return customClaims
}

export async function revokeFirebaseUserRefreshTokens(uid: string): Promise<void> {
  await requireFirebaseAdminAuth().revokeRefreshTokens(normalizeRequiredString(uid, 'Firebase uid'))
}

export async function mergeFirebaseCustomUserClaims(
  uid: string,
  customClaimsPatch: FirebaseCustomClaims
): Promise<FirebaseCustomClaims> {
  const normalizedUid = normalizeRequiredString(uid, 'Firebase uid')
  const auth = requireFirebaseAdminAuth()
  const existingUser = await auth.getUser(normalizedUid)
  const nextClaims = {
    ...normalizeExistingCustomClaims(existingUser.customClaims),
    ...customClaimsPatch
  }

  await auth.setCustomUserClaims(normalizedUid, nextClaims)
  return nextClaims
}
