import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth'
import { useCallback, useEffect } from 'octane'
import { auth, isFirebaseConfigured } from '@/lib/firebase'
import { canPromptGoogleOneTap, shouldFallbackFromGoogleOneTap } from './one-tap-rules'

/**
 * Google One Tap, with `signInWithPopup` as the fallback.
 *
 * One Tap is an enhancement, never the only way in: the browser decides whether
 * the prompt appears at all (FedCM permissions, a cooldown after a dismissal,
 * third-party sign-in disabled, an unsupported browser), and none of those are
 * reportable to us. So nothing here blocks or replaces the Google button that
 * already runs the popup flow - if the prompt never shows, the button is still
 * the way in, and the user never learns there was a second path.
 */

interface PromptMomentNotification {
  isNotDisplayed?: () => boolean
  isSkippedMoment?: () => boolean
  isDismissedMoment?: () => boolean
  getDismissedReason?: () => string
}

interface CredentialResponse {
  credential?: string
}

interface GoogleIdentityApi {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string
        callback: (response: CredentialResponse) => void
        auto_select?: boolean
        cancel_on_tap_outside?: boolean
        context?: 'signin' | 'signup' | 'use'
        itp_support?: boolean
      }) => void
      prompt: (listener?: (notification: PromptMomentNotification) => void) => void
      cancel: () => void
      disableAutoSelect: () => void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentityApi
  }
}

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

export const googleClientId = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? ''

let scriptPromise: Promise<GoogleIdentityApi | null> | null = null
// Module-level, not per component: the topbar remounts on every route change,
// and a prompt per navigation would be a prompt per navigation.
let hasPrompted = false

function loadGoogleIdentityScript(): Promise<GoogleIdentityApi | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (window.google?.accounts?.id) return Promise.resolve(window.google)
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<GoogleIdentityApi | null>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SCRIPT_SRC}"]`)
    const script = existing ?? document.createElement('script')

    const settle = () => resolve(window.google?.accounts?.id ? window.google : null)

    script.addEventListener('load', settle, { once: true })
    // A blocked or offline script is not an error worth surfacing - the popup
    // button covers it - so this resolves null rather than rejecting.
    script.addEventListener('error', () => resolve(null), { once: true })

    if (!existing) {
      script.src = GSI_SCRIPT_SRC
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  })

  return scriptPromise
}

/**
 * A One Tap credential Firebase rejects is a configuration problem, not
 * something the visitor can fix, so the message sends them to the button rather
 * than surfacing a Firebase error code.
 */
function describeOneTapFailure(error: unknown) {
  const code = typeof error === 'object' && error !== null ? String((error as { code?: unknown }).code ?? '') : ''

  if (code === 'auth/invalid-credential' || code === 'auth/invalid-credential-or-provider-id') {
    return 'Google sign-in is unavailable right now. Use the Google button to sign in.'
  }

  if (code === 'auth/account-exists-with-different-credential') {
    return 'This email already signs in another way. Use the Google button to continue.'
  }

  return error instanceof Error ? error.message : 'Google sign-in could not be completed.'
}

/** Exchanges a One Tap ID token for a Firebase session. */
async function signInWithOneTapCredential(credential: string) {
  await signInWithCredential(auth, GoogleAuthProvider.credential(credential))
}

interface PresentGoogleOneTapOptions {
  fallback?: () => Promise<unknown>
  onError?: (message: string) => void
}

async function presentGoogleOneTap({ fallback, onError }: PresentGoogleOneTapOptions = {}): Promise<void> {
  const runFallback = async () => {
    if (!fallback) return
    await fallback()
  }

  if (!isFirebaseConfigured || !googleClientId) {
    await runFallback()
    return
  }

  const google = await loadGoogleIdentityScript()
  if (!google) {
    await runFallback()
    return
  }

  if (auth.currentUser) return

  await new Promise<void>((resolve) => {
    let finished = false

    const finish = () => {
      if (finished) return false
      finished = true
      resolve()
      return true
    }

    const finishWithFallback = () => {
      if (finished) return
      finished = true
      void runFallback()
        .catch((error: unknown) => onError?.(describeOneTapFailure(error)))
        .finally(resolve)
    }

    google.accounts.id.initialize({
      client_id: googleClientId,
      auto_select: false,
      cancel_on_tap_outside: false,
      itp_support: true,
      context: 'signin',
      callback: (response) => {
        if (!response.credential || finished) return

        void signInWithOneTapCredential(response.credential)
          .then(() => finish())
          .catch((error: unknown) => {
            if (fallback) {
              finishWithFallback()
              return
            }

            onError?.(describeOneTapFailure(error))
            finish()
          })
      }
    })

    google.accounts.id.prompt((notification) => {
      if (shouldFallbackFromGoogleOneTap(notification)) {
        finishWithFallback()
        return
      }

      if (
        notification.isDismissedMoment?.() === true &&
        notification.getDismissedReason?.() !== 'credential_returned'
      ) {
        finish()
      }
    })
  })
}

export interface GoogleOneTapOptions {
  /** True while nobody is signed in - the only time a prompt makes sense. */
  isSignedOut: boolean
  /** Auth is still resolving; prompting now could race a restored session. */
  isLoading: boolean
  onError?: (message: string) => void
}

export function useGoogleOneTap({ isSignedOut, isLoading, onError }: GoogleOneTapOptions) {
  const promptWithFallback = useCallback(
    async (fallback: () => Promise<unknown>) => {
      await presentGoogleOneTap({ fallback, onError })
    },
    [onError]
  )

  useEffect(() => {
    if (isLoading) return

    // Once a real session exists, allow a future signed-out state to offer One
    // Tap again. This keeps the once-per-visit guard for route changes and
    // dismissals without persisting a sign-out suppression across refreshes.
    if (!isSignedOut) {
      hasPrompted = false
      return
    }

    const allowed = canPromptGoogleOneTap({
      hostname: window.location.hostname,
      isSignedOut,
      isAuthLoading: isLoading,
      hasClientId: Boolean(googleClientId),
      isConfigured: isFirebaseConfigured,
      hasPrompted
    })

    if (!allowed) return

    hasPrompted = true
    void presentGoogleOneTap({ onError })
  }, [isLoading, isSignedOut, onError])

  return promptWithFallback
}
