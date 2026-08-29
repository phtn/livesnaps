import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
}

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean)

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  const requiredFields = ['apiKey', 'authDomain', 'projectId', 'appId'] as const
  const missingFields = requiredFields.filter((field) => !firebaseConfig[field])
  if (missingFields.length > 0) {
    console.warn(`Firebase config missing required fields: ${missingFields.join(', ')}`)
  }
}

const app = isFirebaseConfigured ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)) : null

export const auth = getAuth(app!)
