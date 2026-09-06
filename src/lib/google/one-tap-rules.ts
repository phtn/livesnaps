import { isAdminSubdomainHostname } from '@/lib/routing/admin-subdomain'
import { isGodsSubdomainHostname } from '@/lib/routing/gods-subdomain'

export interface OneTapPromptConditions {
  hostname: string
  isSignedOut: boolean
  isAuthLoading: boolean
  hasClientId: boolean
  isConfigured: boolean
  isSuppressed: boolean
  hasPrompted: boolean
}

/**
 * Whether a One Tap prompt is allowed right now.
 *
 * Kept apart from the module that talks to Google and Firebase so the rules can
 * be tested without a browser, a Google session, or Firebase configuration.
 *
 * The console rule is the one that guards access: the admin and Citadel origins
 * hold a server-issued session cookie for a specific uid, and their client SDK
 * session is restored from that cookie. A One Tap prompt there could sign the
 * browser in as a *different* Google account than the cookie names, leaving the
 * UI reading one identity while the server acts as another. Those origins do not
 * render the topbar today, so this is belt and braces - but it is the belt that
 * keeps an admin session honest if that ever changes.
 */
export function canPromptGoogleOneTap({
  hostname,
  isSignedOut,
  isAuthLoading,
  hasClientId,
  isConfigured,
  isSuppressed,
  hasPrompted
}: OneTapPromptConditions) {
  if (isAdminSubdomainHostname(hostname) || isGodsSubdomainHostname(hostname)) return false
  if (isAuthLoading || !isSignedOut) return false
  return isConfigured && hasClientId && !isSuppressed && !hasPrompted
}
