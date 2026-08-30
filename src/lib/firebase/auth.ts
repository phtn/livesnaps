import {
  getFirebaseCustomClaimsFromIdTokenResult,
  hasFirebaseSnapAdminAccess,
  type FirebaseCustomClaims
} from '@/lib/firebase-admin/custom-claims'
import {
  getRedirectResult,
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
  type UserCredential
} from 'firebase/auth'
import { useCallback, useEffect, useState } from 'octane'

import { auth, isFirebaseConfigured } from './'

const googleProvider = new GoogleAuthProvider()

googleProvider.setCustomParameters({
  prompt: 'select_account'
})

const TOKEN_FETCH_TIMEOUT_MS = 12_000
const TOKEN_FETCH_MAX_RETRIES = 2

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }) as Promise<T>
}

export const isMessengerInAppBrowser = (): boolean => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || (navigator as { vendor?: string }).vendor || ''
  return /FBAN|FBAV|FBAN\/Messenger|FB_IAB|FB4A|Instagram|Messenger/i.test(ua)
}

export const openInExternalBrowser = (): boolean => {
  if (typeof window === 'undefined') return false
  const href = window.location.href
  // Android Chrome intent - forces external browser
  if (/Android/i.test(navigator.userAgent)) {
    window.location.href = `intent://${href.replace(/^https?:\/\//, '')}#Intent;scheme=https;end`
    return true
  }
  window.open(href, '_blank', 'noopener,noreferrer')
  return true
}

export async function signInWithGoogle(): Promise<UserCredential | void> {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Firebase auth is not configured.')
  }

  // Messenger / FB / Instagram in-app WebView blocks window.open popups - use redirect flow
  if (isMessengerInAppBrowser()) {
    await signInWithRedirect(auth, googleProvider)
    return
  }

  return signInWithPopup(auth, googleProvider)
}

export async function consumeRedirectResult(): Promise<UserCredential | null> {
  if (!isFirebaseConfigured || !auth) return null
  try {
    return await getRedirectResult(auth)
  } catch {
    return null
  }
}

export function useFirebaseUser() {
  const [user, setUser] = useState<User | null>(null)
  const [customClaims, setCustomClaims] = useState<FirebaseCustomClaims>({})
  const [hasAdminClaim, setHasAdminClaim] = useState(false)
  const [hasSnapAdminAccess, setHasSnapAdminAccess] = useState(false)
  const [isLoading, setIsLoading] = useState(Boolean(auth))
  const [authError, setAuthError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Complete redirect flow (Messenger in-app browser) - must be called once on mount
  useEffect(() => {
    if (!auth) return
    void consumeRedirectResult()
  }, [])

  useEffect(() => {
    if (!auth) return

    let isCancelled = false
    let latestTokenRequest = 0

    const loadClaimsWithRetry = async (nextUser: User, requestId: number, forceRefreshInitial: boolean) => {
      let lastError: unknown = null

      for (let attempt = 0; attempt <= TOKEN_FETCH_MAX_RETRIES; attempt++) {
        const shouldForceRefresh = forceRefreshInitial || attempt > 0

        try {
          const tokenResult = await withTimeout(
            nextUser.getIdTokenResult(shouldForceRefresh),
            TOKEN_FETCH_TIMEOUT_MS,
            'Token fetch'
          )

          if (isCancelled || requestId !== latestTokenRequest) {
            return
          }

          const nextCustomClaims = getFirebaseCustomClaimsFromIdTokenResult(tokenResult)
          setCustomClaims(nextCustomClaims)
          setHasAdminClaim(nextCustomClaims.admin === true)
          setHasSnapAdminAccess(hasFirebaseSnapAdminAccess(nextCustomClaims))
          setAuthError(null)
          setIsLoading(false)
          return
        } catch (error) {
          lastError = error

          if (isCancelled || requestId !== latestTokenRequest) {
            return
          }

          if (attempt < TOKEN_FETCH_MAX_RETRIES) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
            continue
          }
        }
      }

      if (isCancelled || requestId !== latestTokenRequest) {
        return
      }

      setCustomClaims({})
      setHasAdminClaim(false)
      setHasSnapAdminAccess(false)
      setAuthError(
        lastError instanceof Error ? lastError.message : 'Failed to load auth claims. Please re-authenticate.'
      )
      setIsLoading(false)
    }

    const unsubscribe = onIdTokenChanged(auth, (nextUser) => {
      latestTokenRequest += 1
      const requestId = latestTokenRequest

      setUser(nextUser)
      setAuthError(null)

      if (!nextUser) {
        setCustomClaims({})
        setHasAdminClaim(false)
        setHasSnapAdminAccess(false)
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      void loadClaimsWithRetry(nextUser, requestId, false)
    })

    return () => {
      isCancelled = true
      unsubscribe()
    }
  }, [])

  const refreshClaims = useCallback(async () => {
    const currentUser = auth?.currentUser ?? user

    if (!currentUser) {
      setAuthError('No signed-in user to refresh.')
      return
    }

    setIsRefreshing(true)
    setAuthError(null)

    try {
      await withTimeout(currentUser.getIdToken(true), TOKEN_FETCH_TIMEOUT_MS, 'Token refresh')
      const tokenResult = await withTimeout(currentUser.getIdTokenResult(true), TOKEN_FETCH_TIMEOUT_MS, 'Token fetch')
      const nextCustomClaims = getFirebaseCustomClaimsFromIdTokenResult(tokenResult)
      setCustomClaims(nextCustomClaims)
      setHasAdminClaim(nextCustomClaims.admin === true)
      setHasSnapAdminAccess(hasFirebaseSnapAdminAccess(nextCustomClaims))

      if (nextCustomClaims.admin !== true) {
        setAuthError('Admin claim still missing after refresh. Please re-authenticate.')
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Failed to refresh session.')
    } finally {
      setIsRefreshing(false)
    }
  }, [user])

  const reauthenticate = useCallback(async () => {
    setAuthError(null)
    // Always try a forced refresh first; caller can fall back to signInWithGoogle if claim still missing
    await refreshClaims()
  }, [refreshClaims])

  // Auto background force-refresh when we have a user but no admin claim (stale token case common on mobile)
  useEffect(() => {
    if (!user || hasAdminClaim || isLoading || isRefreshing || authError) return

    const timer = setTimeout(() => {
      void refreshClaims()
    }, 1500)

    return () => clearTimeout(timer)
  }, [user, hasAdminClaim, isLoading, isRefreshing, authError, refreshClaims])

  return {
    customClaims,
    hasAdminClaim,
    hasSnapAdminAccess,
    isLoading,
    user,
    authError,
    isRefreshing,
    refreshClaims,
    reauthenticate,
    // alias for ergonomics
    refresh: refreshClaims
  }
}

export async function signOutUser(): Promise<void> {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Firebase auth is not configured.')
  }

  await signOut(auth)
}
