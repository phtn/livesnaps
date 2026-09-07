import { useSyncExternalStore } from 'octane'
import { getConvexAuthState, subscribeToConvexAuthState } from '@/lib/convex-client'

export function useConvexAuth() {
  return useSyncExternalStore(subscribeToConvexAuthState, getConvexAuthState)
}
