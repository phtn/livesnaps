const R2_USER_KEY_PREFIX = 'user'
const R2_USER_ROUTE_PREFIX = `/api/r2/${R2_USER_KEY_PREFIX}`

export const r2u = (filename: string) => {
  return `${R2_USER_ROUTE_PREFIX}${encodeURIComponent(filename)}`
}

const getAccountProfileImageFilename = (value: string) => {
  let filename: string

  try {
    filename = decodeURIComponent(value)
  } catch {
    return null
  }

  if (!filename || filename === '.' || filename === '..' || filename.includes('/') || filename.includes('\\')) {
    return null
  }

  return filename
}

export const resolveAccountProfileImageUrl = (source: string) => {
  if (!source || source.startsWith('blob:') || source.startsWith(R2_USER_ROUTE_PREFIX)) {
    return source
  }

  if (source.startsWith(R2_USER_KEY_PREFIX)) {
    const filename = getAccountProfileImageFilename(source.slice(R2_USER_KEY_PREFIX.length))
    return filename ? r2u(filename) : source
  }

  try {
    const url = new URL(source)
    const objectPathMarker = `/${R2_USER_KEY_PREFIX}`
    const markerIndex = url.pathname.lastIndexOf(objectPathMarker)

    if (markerIndex === -1) return source

    const filename = getAccountProfileImageFilename(url.pathname.slice(markerIndex + objectPathMarker.length))
    return filename ? r2u(filename) : source
  } catch {
    return source
  }
}
export function formatDate(date: Date | string | number, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('en-US', {
    month: opts.month ?? 'long',
    day: opts.day ?? 'numeric',
    year: opts.year ?? 'numeric',
    ...opts
  }).format(new Date(date))
}
