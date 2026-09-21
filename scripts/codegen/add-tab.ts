#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import {
  addToAddChildren,
  buildPlaceholderPage,
  insertPanelRoute,
  insertRouteConst,
  removeFromAddChildren,
  removePanelRoute,
  removeRouteConst,
  resolveSpec,
  SHELLS
} from '../../src/lib/codegen/tab-codegen.ts'

function usage(): string {
  return `add-tab --shell <name> --id <tab-id> [--label <Label>] [--short-label <S>] [--icon <name>] [--path <segment>] [--href <href>] [--file <name.btsx>] [--dry-run] [--force]
add-tab --shell <name> --id <tab-id> --delete [--dry-run]

Shells: ${Object.keys(SHELLS).join(', ')}
Example: bun run scripts/codegen/add-tab.ts --shell citadel-settings --id tools --label Tools --icon tools
Delete:  bun run scripts/codegen/add-tab.ts --shell citadel-settings --id audit --delete
Deletion always asks for confirmation after listing what will be removed;
--dry-run lists without asking or changing anything.
`
}

async function confirm(question: string): Promise<boolean> {
  try {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = (await rl.question(question)).trim().toLowerCase()
    rl.close()
    return answer === 'y' || answer === 'yes'
  } catch {
    return false
  }
}

function parse(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--dry-run') out['dry-run'] = true
    else if (arg === '--force') out.force = true
    else if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) out[key] = true
      else {
        out[key] = next
        i++
      }
    }
  }
  return out
}

const args = parse(process.argv.slice(2))
if (args.help) {
  console.log(usage())
  process.exit(0)
}

const root = join(dirname(new URL(import.meta.url).pathname), '..', '..')
async function main(): Promise<void> {
  try {
    const shell = String(args.shell ?? '')
    const id = String(args.id ?? '')
    if (!shell || !id || args.shell === true || args.id === true) throw new Error(usage())
    const spec = resolveSpec({
      shell,
      id,
      label: typeof args.label === 'string' ? args.label : undefined,
      shortLabel: typeof args['short-label'] === 'string' ? (args['short-label'] as string) : undefined,
      icon: typeof args.icon === 'string' ? args.icon : undefined,
      path: typeof args.path === 'string' ? args.path : undefined,
      href: typeof args.href === 'string' ? args.href : undefined,
      file: typeof args.file === 'string' ? args.file : undefined
    })
    const config = SHELLS[spec.shell]
    const dryRun = args['dry-run'] === true
    const force = args.force === true
    const del = args.delete === true || args.remove === true

    const shellPath = join(root, config.shellFile)
    const routerPath = join(root, 'src/router.ts')
    const pageName = spec.file.split('/').pop() as string
    const pagePath = join(root, 'src/pages', pageName)

    if (del) {
      await runDelete({ config, spec, shellPath, routerPath, pageName, pagePath, dryRun })
      return
    }

    const shellBefore = readFileSync(shellPath, 'utf8')
    const shellAfter = insertPanelRoute(shellBefore, spec)
    const shellChanged = shellAfter !== shellBefore

    const routerBefore = readFileSync(routerPath, 'utf8')
    let routerAfter = insertRouteConst(routerBefore, spec, config.parentRoute)
    routerAfter = addToAddChildren(routerAfter, config.parentRoute, spec.routeConst)
    const routerChanged = routerAfter !== routerBefore

    const pageExists = existsSync(pagePath)
    const pageBody = buildPlaceholderPage(spec)

    console.log(`shell: ${config.shellFile} ${shellChanged ? '(add tab)' : '(tab exists)'}`)
    console.log(
      `route: ${spec.routeConst} path='${spec.path}' href='${spec.href}' ${routerChanged ? '(update router.ts)' : '(router exists)'}`
    )
    console.log(
      `page:  src/pages/${pageName} ${pageExists && !force ? '(exists, use --force to overwrite)' : dryRun ? '(would write)' : '(write)'}`
    )

    if (dryRun) return

    if (shellChanged) writeFileSync(shellPath, shellAfter)
    if (routerChanged) writeFileSync(routerPath, routerAfter)
    if (!pageExists || force) {
      mkdirSync(dirname(pagePath), { recursive: true })
      writeFileSync(pagePath, pageBody)
    }
    console.log('done.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

async function runDelete(args: {
  config: (typeof SHELLS)[string]
  spec: ReturnType<typeof resolveSpec>
  shellPath: string
  routerPath: string
  pageName: string
  pagePath: string
  dryRun: boolean
}): Promise<void> {
  const { config, spec, shellPath, routerPath, pageName, pagePath, dryRun } = args
  const shellBefore = readFileSync(shellPath, 'utf8')
  const shellAfter = removePanelRoute(shellBefore, spec.id)
  const entryFound = shellAfter !== shellBefore

  const routerBefore = readFileSync(routerPath, 'utf8')
  const withoutConst = removeRouteConst(routerBefore, spec.routeConst)
  const routeFound = withoutConst !== routerBefore
  const routerAfter = removeFromAddChildren(withoutConst, config.parentRoute, spec.routeConst)
  const memberFound = routerAfter !== withoutConst

  const pageExists = existsSync(pagePath)

  if (!entryFound && !routeFound && !memberFound && !pageExists) {
    console.log(`Nothing to delete: no '${spec.id}' tab in shell '${spec.shell}'.`)
    return
  }

  console.log(`This will delete the '${spec.id}' tab from shell '${spec.shell}':`)
  console.log(`  ${entryFound ? '-' : '(absent)'} tab entry in ${config.shellFile}`)
  console.log(`  ${routeFound ? '-' : '(absent)'} route ${spec.routeConst} in src/router.ts`)
  console.log(`  ${memberFound ? '-' : '(absent)'} ${config.parentRoute}.addChildren membership`)
  console.log(
    `  ${pageExists ? '-' : '(absent)'} page file src/pages/${pageName}${pageExists ? ' (file will be deleted)' : ''}`
  )

  if (dryRun) return

  if (!(await confirm(`Delete these? [y/N] `))) {
    console.log('Aborted; nothing changed.')
    process.exit(1)
  }

  if (entryFound) writeFileSync(shellPath, shellAfter)
  if (routeFound || memberFound) writeFileSync(routerPath, routerAfter)
  if (pageExists) rmSync(pagePath)
  console.log('deleted.')
}

await main()
