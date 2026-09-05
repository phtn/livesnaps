import { type ClassValue, clsx } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export const getInitials = (label?: string | null) => {
  if (!label) {
    return 'US'
  }

  const parts = label
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) {
    return label.slice(0, 2).toUpperCase()
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}
