import type { IconName } from '@/lib/icons'

export const SNAPS_ROUTE_PREFIX = '/l' as const

type SnapsNavItem = {
  color: string
  description: string
  icon: IconName
  label: string
  path: string
}

export const SNAPS_OVERVIEW_NAV_ITEM = {
  color: 'hsl(187,90%,51%)',
  description: 'Live Snaps verification overview.',
  icon: 'grid',
  label: 'Overview',
  path: '/'
} as const satisfies SnapsNavItem

export const SNAPS_PAGE_NAV_ITEMS = [
  {
    color: 'hsl(280,65%,60%)',
    description: 'Settings for Snap User.',
    icon: 'settings',
    label: 'Settings',
    path: '/settings',
    slug: 'settings'
  },
  {
    color: 'hsl(280,65%,60%)',
    description: 'Workspace',
    icon: 'workspace',
    label: 'Workspace',
    path: '/workspace',
    slug: 'workspace'
  },
  {
    color: 'hsl(280,65%,60%)',
    description: 'Review location-verified proof sessions.',
    icon: 'gallery',
    label: 'Snaps',
    path: '/snaps',
    slug: 'snaps'
  }
] as const satisfies ReadonlyArray<SnapsNavItem & { slug: string }>

export type SnapsPageSlug = (typeof SNAPS_PAGE_NAV_ITEMS)[number]['slug']

export const SNAPS_NAV_ITEMS = [...SNAPS_PAGE_NAV_ITEMS, SNAPS_OVERVIEW_NAV_ITEM]

export function isSnapsPageSlug(value: string): value is SnapsPageSlug {
  return SNAPS_PAGE_NAV_ITEMS.some(({ slug }) => slug === value)
}

export function getSnapsPageNavItem(slug: string) {
  return SNAPS_PAGE_NAV_ITEMS.find((item) => item.slug === slug)
}

export function resolveSnapsNavigationPath(destination: string, currentPathname: string) {
  const usesInternalPath =
    currentPathname === SNAPS_ROUTE_PREFIX || currentPathname.startsWith(`${SNAPS_ROUTE_PREFIX}/`)

  if (!usesInternalPath) {
    return destination
  }

  return destination === '/' ? SNAPS_ROUTE_PREFIX : `${SNAPS_ROUTE_PREFIX}${destination}`
}
