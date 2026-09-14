import { useConvexAuth } from '@/hooks/use-convex'
import { useConvexQuery } from '@/hooks/use-convex-query'
import { resolveUserAvatar, type UserAvatarSource } from '@/lib/r2/user-avatars'
import type { api } from '../../convex/_generated/api'

const currentUserQuery = 'users/q:current' as unknown as typeof api.users.q.current

/**
 * The signed-in user's avatar: their R2 mirror first, then the Convex
 * `imageUrl`. `providerPhotoUrl` (Firebase's `photoURL`) only stands in when
 * Convex has no row to resolve from, so a loading session shows initials
 * instead of fetching the provider photo it's about to replace.
 */
export function useCurrentUserAvatar(providerPhotoUrl?: string | null): UserAvatarSource {
  const convexAuth = useConvexAuth()
  const user = useConvexQuery(currentUserQuery, convexAuth.isAuthenticated ? {} : 'skip', convexAuth.userId ?? '')
  const photoUrl = providerPhotoUrl?.trim() || null

  if (convexAuth.isLoading || (convexAuth.isAuthenticated && user === undefined)) {
    return { src: null, fallbackSrc: null }
  }
  if (!user) return { src: photoUrl, fallbackSrc: null }

  const avatar = resolveUserAvatar(user)
  return avatar.src
    ? { src: avatar.src, fallbackSrc: avatar.fallbackSrc ?? photoUrl }
    : { src: photoUrl, fallbackSrc: null }
}
