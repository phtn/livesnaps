import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth'
import { useEffect, useRef } from 'octane'
import { auth, isFirebaseConfigured } from '@/lib/firebase'

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
        use_fedcm_for_prompt?: boolean
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
// One Tap immediately after a sign-out reads as the app refusing to let you
// leave, so it stays down for the rest of the tab's life once that happens.
const SUPPRESSION_KEY = 'livesnaps-one-tap-suppressed'

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

function isSuppressed() {
  try {
    return window.sessionStorage.getItem(SUPPRESSION_KEY) === 'true'
  } catch {
    return false
  }
}

function suppressForSession() {
  try {
    window.sessionStorage.setItem(SUPPRESSION_KEY, 'true')
  } catch {
    // A browser that refuses session storage still gets a single prompt per
    // page load, which is the behavior worth preserving here.
  }
}

/** Exchanges a One Tap ID token for a Firebase session. */
async function signInWithOneTapCredential(credential: string) {
  await signInWithCredential(auth, GoogleAuthProvider.credential(credential))
}

export interface GoogleOneTapOptions {
  /** True while nobody is signed in - the only time a prompt makes sense. */
  isSignedOut: boolean
  /** Auth is still resolving; prompting now could race a restored session. */
  isLoading: boolean
  onError?: (message: string) => void
}

export function useGoogleOneTap({ isSignedOut, isLoading, onError }: GoogleOneTapOptions) {
  const wasSignedInRef = useRef(false)

  useEffect(() => {
    if (isLoading) return

    // A signed-out state that follows a signed-in one is a sign-out. Prompting
    // through it would fight the user, so One Tap stands down for this tab.
    if (!isSignedOut) {
      wasSignedInRef.current = true
      return
    }

    if (wasSignedInRef.current) {
      suppressForSession()
      window.google?.accounts.id.disableAutoSelect()
      wasSignedInRef.current = false
      return
    }

    if (hasPrompted || !isFirebaseConfigured || !googleClientId || isSuppressed()) return

    hasPrompted = true
    let cancelled = false

    void loadGoogleIdentityScript().then((google) => {
      if (!google || cancelled || auth.currentUser) return

      google.accounts.id.initialize({
        client_id: googleClientId,
        // FedCM is how Chrome renders One Tap now; without it the prompt is
        // simply never shown in current browsers.
        use_fedcm_for_prompt: true,
        // Sign-in stays a deliberate act: the prompt offers an account, it does
        // not pick one on the user's behalf.
        auto_select: false,
        cancel_on_tap_outside: false,
        itp_support: true,
        context: 'signin',
        callback: (response) => {
          if (!response.credential) return

          void signInWithOneTapCredential(response.credential).catch((error: unknown) => {
            // The popup button is still on screen and still works, so this
            // reports rather than retries.
            const message = error instanceof Error ? error.message : 'Google sign-in could not be completed.'
            onError?.(message)
          })
        }
      })

      google.accounts.id.prompt()
    })

    return () => {
      cancelled = true
    }
  }, [isLoading, isSignedOut, onError])
}
