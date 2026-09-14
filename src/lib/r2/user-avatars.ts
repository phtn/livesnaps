export const USER_AVATAR_SIZE = 40
export const USER_AVATAR_FILENAME = '1010.webp'
export const USER_AVATAR_ROUTE_PREFIX = '/api/avatars/'

const ID_SEGMENT = /^[a-z0-9_-]+$/i

export const isUserAvatarId = (userId: string) => ID_SEGMENT.test(userId)

export const buildUserAvatarObjectKey = (userId: string) => {
  if (!isUserAvatarId(userId)) {
    throw new Error('Invalid user avatar path.')
  }
  return `users/${userId}/${USER_AVATAR_FILENAME}`
}

// FNV-1a: a short, stable fingerprint of the source URL, so the served URL
// changes whenever the avatar is regenerated and can be cached as immutable.
const fingerprint = (value: string) => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export const getUserAvatarUrl = (userId: string, sourceUrl?: string) => {
  if (!isUserAvatarId(userId)) {
    throw new Error('Invalid user avatar path.')
  }
  const route = `${USER_AVATAR_ROUTE_PREFIX}${userId}`
  return sourceUrl ? `${route}?v=${fingerprint(sourceUrl)}` : route
}

export interface AvatarUser {
  _id: string
  avatarR2Key?: string
  avatarSourceUrl?: string
  imageUrl?: string
}

export interface UserAvatarSource {
  src: string | null
  /** Tried when `src` fails to load, e.g. the provider photo while R2 is unreachable. */
  fallbackSrc: string | null
}

/**
 * Serves the R2 mirror once `users/avatar:sync` has written it; until then, or
 * if it fails to load, the provider-hosted `imageUrl` stands in.
 */
export const resolveUserAvatar = (user: AvatarUser | null | undefined): UserAvatarSource => {
  const imageUrl = user?.imageUrl?.trim() || null
  if (!user?.avatarR2Key || !isUserAvatarId(user._id)) {
    return { src: imageUrl, fallbackSrc: null }
  }
  return { src: getUserAvatarUrl(user._id, user.avatarSourceUrl), fallbackSrc: imageUrl }
}
