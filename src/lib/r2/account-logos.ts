export const ACCOUNT_LOGO_MAX_SOURCE_BYTES = 4 * 1024 * 1024
export const ACCOUNT_LOGO_MAX_WEBP_BYTES = 2 * 1024 * 1024
export const ACCOUNT_LOGO_MAX_DIMENSION = 1024

const ID_SEGMENT = /^[a-z0-9_-]+$/i
const LOGO_FILENAME = /^l[a-f0-9]{32}\.webp$/

export const buildAccountLogoObjectKey = (accountId: string, logoId: string) => {
  if (!ID_SEGMENT.test(accountId) || !/^[a-f0-9]{32}$/.test(logoId)) {
    throw new Error('Invalid account logo path.')
  }
  return `accounts/${accountId}/logos/l${logoId}.webp`
}

export const isAccountLogoObjectKey = (accountId: string, value: string) => {
  const prefix = `accounts/${accountId}/logos/`
  return ID_SEGMENT.test(accountId) && value.startsWith(prefix) && LOGO_FILENAME.test(value.slice(prefix.length))
}
