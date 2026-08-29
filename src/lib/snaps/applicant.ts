export interface SnapApplicantIdentity {
  email?: string
  name?: string
  subject?: string
  tokenIdentifier: string
}

export interface SnapApplicant {
  email: string
  firebaseUid: string
  fullName: string
  tokenIdentifier: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FIREBASE_UID_MAX_LENGTH = 128

export const resolveSnapApplicant = (identity: SnapApplicantIdentity | null): SnapApplicant => {
  if (!identity) {
    throw new Error('Sign in before starting a proof submission.')
  }

  const fullName = identity.name?.trim() ?? ''
  const email = identity.email?.trim().toLowerCase() ?? ''
  const firebaseUid = identity.subject?.trim() ?? ''

  if (!fullName) {
    throw new Error('Your signed-in account needs a display name before submitting proof.')
  }

  if (!EMAIL_PATTERN.test(email)) {
    throw new Error('Your signed-in account needs a valid email before submitting proof.')
  }

  if (!firebaseUid || firebaseUid.length > FIREBASE_UID_MAX_LENGTH) {
    throw new Error('Your signed-in account has an invalid Firebase UID.')
  }

  return {
    email,
    firebaseUid,
    fullName,
    tokenIdentifier: identity.tokenIdentifier
  }
}
