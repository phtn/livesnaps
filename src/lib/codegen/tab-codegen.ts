export interface TabShell {
  shellFile: string
  parentRoute: string
  baseHref: string
  filePrefix: string
  routePrefix: string
}

export const SHELLS: Record<string, TabShell> = {
  'citadel-settings': {
    shellFile: 'src/pages/citadel-settings-page.btsx',
    parentRoute: 'citadelSettingsRoute',
    baseHref: '/citadel/settings',
    filePrefix: 'citadel-settings-',
    routePrefix: 'citadelSettings'
  },
  'admin-settings': {
    shellFile: 'src/pages/admin-settings-page.btsx',
    parentRoute: 'adminSettingsRoute',
    baseHref: '/admin-settings',
    filePrefix: 'admin-settings-',
    routePrefix: 'adminSettings'
  },
  'citadel-accounts': {
    shellFile: 'src/pages/citadel-accounts-page.btsx',
    parentRoute: 'citadelAccountsRoute',
    baseHref: '/citadel/accounts',
    filePrefix: 'citadel-accounts-',
    routePrefix: 'citadelAccounts'
  }
}

export interface TabSpec {
  shell: string
  id: string
  label: string
  shortLabel: string
  icon: string
  path: string
  href: string
  file: string
  routeConst: string
}

export function toPascal(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

export function toTitle(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function resolveSpec(args: {
  shell: string
  id: string
  label?: string
  shortLabel?: string
  icon?: string
  path?: string
  href?: string
  file?: string
}): TabSpec {
  const shellConfig = SHELLS[args.shell]
  if (!shellConfig) throw new Error(`Unknown shell "${args.shell}". Known: ${Object.keys(SHELLS).join(', ')}`)
  const id = args.id.trim()
  if (!id) throw new Error('Tab id is required')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`Tab id "${id}" must be kebab-case`)
  const label = args.label?.trim() || toTitle(id)
  const shortLabel = args.shortLabel?.trim() || label
  const icon = args.icon?.trim() || 'settings'
  const path = (args.path?.trim() || id).replace(/^\/+/, '')
  if (!path || path.includes('/') || path.includes(' '))
    throw new Error(`Route path "${path}" must be a single segment`)
  const isIndex = path === '/' || path === ''
  const href = args.href?.trim() || (isIndex ? shellConfig.baseHref : `${shellConfig.baseHref}/${path}`)
  const file = args.file?.trim() || `${shellConfig.filePrefix}${id}-page.btsx`
  if (file.includes(' ') || !file.endsWith('.btsx')) throw new Error(`Page file "${file}" must end in .btsx`)
  return {
    shell: args.shell,
    id,
    label,
    shortLabel,
    icon,
    path: isIndex ? '/' : path,
    href,
    file,
    routeConst: `${shellConfig.routePrefix}${toPascal(id)}Route`
  }
}

export function buildPanelEntry(spec: TabSpec): string {
  return `    { id: '${spec.id}', href: '${spec.href}', label: '${spec.label}', shortLabel: '${spec.shortLabel}', icon: '${spec.icon}' },`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function panelArrayRange(source: string): { open: number; close: number } {
  const marker = 'export const panelRoutes'
  const start = source.indexOf(marker)
  if (start === -1) throw new Error('panelRoutes not found in shell file')
  // The type annotation itself contains brackets (`readonly PanelRoute[]`),
  // so scan from the initializer's opening bracket to its true close,
  // skipping over string literals and comments.
  const eq = source.indexOf('=', start)
  const open = eq === -1 ? -1 : source.indexOf('[', eq)
  if (open === -1) throw new Error('panelRoutes array never opens')
  let depth = 0
  let quote: string | null = null
  let i = open
  for (; i < source.length; i++) {
    const ch = source[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch
    else if (ch === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i)
      i = end === -1 ? source.length : end
    } else if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      if (end === -1) throw new Error('panelRoutes array never closes')
      i = end + 1
    } else if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) break
    }
  }
  if (depth !== 0) throw new Error('panelRoutes array never closes')
  return { open, close: i }
}

export function insertPanelRoute(source: string, spec: TabSpec): string {
  if (source.includes(`id: '${spec.id}'`) || source.includes(`id: "${spec.id}"`)) return source
  const { close: i } = panelArrayRange(source)
  // Keep the closing bracket's own indentation: the slice before it ends with
  // that indent, which would otherwise glue onto the new entry and leave `]`
  // at column 0 — where BTSX parses it as an element selector (BEAST1101).
  const lineStart = source.lastIndexOf('\n', i - 1) + 1
  const indent = source.slice(lineStart, i)
  if (/^[ \t]*$/.test(indent)) {
    // `]` has its own line: anchor the entry at the line start so it neither
    // inherits the bracket's indent nor leaves `]` at column 0 (BEAST1101).
    return `${source.slice(0, lineStart)}${buildPanelEntry(spec)}\n${source.slice(lineStart)}`
  }
  return `${source.slice(0, i)}${buildPanelEntry(spec)}\n${source.slice(i)}`
}

export function removePanelRoute(source: string, id: string): string {
  const { open, close } = panelArrayRange(source)
  const body = source.slice(open, close + 1)
  // Entries are single-line object literals; match the whole line by id.
  const entry = new RegExp(`\n[ \\t]*\\{[^\\n\\}]*id:\\s*['"]${escapeRegExp(id)}['"][^\\n\\}]*\\},?`)
  if (!entry.test(body)) return source
  return `${source.slice(0, open)}${body.replace(entry, '')}${source.slice(close + 1)}`
}

export function buildRouteBlock(spec: TabSpec, parentRoute: string): string {
  return `const ${spec.routeConst} = createRoute({\n  getParentRoute: () => ${parentRoute},\n  path: '${spec.path}',\n  component: lazyRoute(() => import('./pages/${spec.file}'))\n})`
}

export function insertRouteConst(routerSource: string, spec: TabSpec, parentRoute: string): string {
  if (routerSource.includes(spec.routeConst)) return routerSource
  const block = `${buildRouteBlock(spec, parentRoute)}\n\n`
  const anchor = 'const routeTree'
  const at = routerSource.indexOf(anchor)
  if (at === -1) throw new Error('const routeTree not found in router.ts')
  return `${routerSource.slice(0, at)}${block}${routerSource.slice(at)}`
}

export function addToAddChildren(routerSource: string, parentRoute: string, routeConst: string): string {
  if (
    routerSource.includes(`${parentRoute}.addChildren([${routeConst}`) ||
    routerSource.includes(`, ${routeConst}]`) ||
    routerSource.includes(`, ${routeConst},`)
  )
    return routerSource
  const marker = `${parentRoute}.addChildren([`
  const start = routerSource.indexOf(marker)
  if (start === -1) throw new Error(`${marker} not found in router.ts`)
  // Find the matching close bracket for this addChildren call.
  let depth = 0
  for (let i = start + marker.length - 1; i < routerSource.length; i++) {
    const ch = routerSource[i]
    if (ch === '[') depth++
    if (ch === ']') {
      depth--
      if (depth === 0) {
        const before = routerSource.slice(0, i).replace(/\s+$/, '')
        const after = routerSource.slice(i)
        const needsComma = !before.endsWith('[')
        return `${before}${needsComma ? ', ' : ''}${routeConst}${after}`
      }
    }
  }
  throw new Error(`Could not close ${marker}`)
}

export function removeRouteConst(routerSource: string, routeConst: string): string {
  const re = new RegExp(`\n?const ${escapeRegExp(routeConst)} = createRoute\\(\\{[\\s\\S]*?\\n\\}\\)\n?`)
  if (!re.test(routerSource)) return routerSource
  return routerSource.replace(re, '')
}

export function removeFromAddChildren(routerSource: string, parentRoute: string, routeConst: string): string {
  const marker = `${parentRoute}.addChildren([`
  const start = routerSource.indexOf(marker)
  if (start === -1) return routerSource
  let depth = 0
  let close = -1
  for (let i = start + marker.length - 1; i < routerSource.length; i++) {
    const ch = routerSource[i]
    if (ch === '[') depth++
    if (ch === ']') {
      depth--
      if (depth === 0) {
        close = i
        break
      }
    }
  }
  if (close === -1) return routerSource
  const segment = routerSource.slice(start, close + 1)
  const c = escapeRegExp(routeConst)
  const trailing = new RegExp(`,\\s*${c}(?=\\s*[,\\]])`)
  const leading = new RegExp(`${c}\\s*,\\s*`)
  const sole = new RegExp(`\\[\\s*${c}\\s*\\]`)
  let next = segment
  if (trailing.test(next)) next = next.replace(trailing, '')
  else if (leading.test(next)) next = next.replace(leading, '')
  else if (sole.test(next)) next = next.replace(sole, '[]')
  else return routerSource
  return `${routerSource.slice(0, start)}${next}${routerSource.slice(close + 1)}`
}

export function buildPlaceholderPage(spec: TabSpec): string {
  return `import {InnerContainer} from '@/components/admin'

InnerContainer
  header(className='flex items-start justify-between gap-6 border-b border-border/30 pb-6')
    div
      p(className='font-mono text-2xs uppercase tracking-[0.18em] text-muted-foreground') ${spec.label}
      h2(className='mt-2 font-poly font-medium text-lg sm:text-xl tracking-tight') ${spec.label}
  section
    p(className='mt-6 max-w-2xl text-sm leading-6 text-muted-foreground') ${spec.label} panel placeholder. Replace src/pages/${spec.file} with the real panel.
`
}
