import { useRouter } from '@octanejs/tanstack-router'
import { useEffect, useRef } from 'octane'

// Marks the throwaway history entry this hook pushes while an overlay is open,
// so a back gesture pops that entry instead of leaving the page.
const BACK_DISMISS_STATE_KEY = '__backDismiss'

const isBackDismissEntry = (state: unknown) =>
  Boolean(state && typeof state === 'object' && (state as Record<string, unknown>)[BACK_DISMISS_STATE_KEY])

/**
 * Turns the platform back gesture into a dismiss for a fullscreen overlay.
 *
 * While `active`, an extra history entry sits on top of the current route: back
 * pops it, the router lands on the route the overlay covers, and `onDismiss`
 * closes the overlay instead of the page navigating away. Dismissing any other
 * way (close button, Escape) removes that entry on cleanup, so the stack is left
 * exactly as it was found. Routing away while open also dismisses.
 *
 * Pushes through the router's own history so the entry carries TanStack's
 * index/key bookkeeping — a raw `history.pushState` would desync it.
 */
export function useBackDismiss(active: boolean, onDismiss: VoidFunction) {
  const router = useRouter()
  const dismissRef = useRef(onDismiss)
  const pushedRef = useRef(false)

  useEffect(() => {
    dismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!active) return

    const history = router.history
    history.push(history.location.href, { [BACK_DISMISS_STATE_KEY]: true })
    pushedRef.current = true

    const unsubscribe = history.subscribe(({ location }) => {
      if (isBackDismissEntry(location.state)) return
      pushedRef.current = false
      dismissRef.current()
    })

    return () => {
      unsubscribe()
      if (!pushedRef.current) return
      pushedRef.current = false
      history.back()
    }
  }, [active, router])
}
