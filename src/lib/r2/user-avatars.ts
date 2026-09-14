export const USER_AVATAR_SIZE = 40
export const USER_AVATAR_FILENAME = '1010.webp'

const ID_SEGMENT = /^[a-z0-9_-]+$/i

export const buildUserAvatarObjectKey = (userId: string) => {
  if (!ID_SEGMENT.test(userId)) {
    throw new Error('Invalid user avatar path.')
  }
  return `users/${userId}/${USER_AVATAR_FILENAME}`
}
