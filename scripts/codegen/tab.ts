#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import {
  addToAddChildren,
  buildPlaceholderPage,
  insertPanelRoute,
  insertRouteConst,
  listPanelRoutes,
  removeFromAddChildren,
  removePanelRoute,
  removeRouteConst,
  resolveSpec,
  SHELLS
} from '../../src/lib/codegen/tab-codegen.ts'

function usage(): string {
  return `tab (interactive menu)
tab --interactive [--shell <name>] [--dry-run]
tab --shell <name> --id <tab-id> [--label <Label>] [--short-label <S>] [--icon <name>] [--path <segment>] [--href <href>] [--file <name.btsx>] [--dry-run] [--force]
tab --shell <name> --id <tab-id> --delete [--dry-run]
tab --list [--shell <name>]

Shells: ${Object.keys(SHELLS).join(', ')}
Example: bun run scripts/codegen/tab.ts --shell citadel-settings --id tools --label Tools --icon tools
Delete:  bun run scripts/codegen/tab.ts --shell citadel-settings --id audit --delete
Deletion always asks for confirmation after listing what will be removed;
--dry-run lists without asking or changing anything.
`
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const controller = new AbortController()
  rl.on('SIGINT', () => { controller.abort(); rl.close() })
  rl.on('close', () => controller.abort())
  try {
    const answer = (await rl.question(question, { signal: controller.signal })).trim().toLowerCase()
    return answer === 'y' || answer === 'yes'
  } catch {
    return false
  } finally { rl.close() }
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

let args = parse(process.argv.slice(2))
if (args.help) {
  console.log(usage())
  process.exit(0)
}

const root = join(dirname(new URL(import.meta.url).pathname), '..', '..')
const interactive = process.argv.length === 2 || 'interactive' in args

async function promptForArgs(): Promise<Record<string, string | boolean> | null> {
  if (!process.stdin.isTTY) throw new Error('Interactive mode requires a terminal. Use --help for flag-based commands.')
  for (const flag of Object.keys(args)) {
    if (!['interactive', 'shell', 'dry-run'].includes(flag)) throw new Error(`--${flag} cannot be combined with interactive mode.`)
  }
  if ('interactive' in args && args.interactive !== true) throw new Error('--interactive does not take a value.')
  if (args.shell !== undefined && (typeof args.shell !== 'string' || !Object.hasOwn(SHELLS, args.shell))) {
    throw new Error(`Choose a shell: ${Object.keys(SHELLS).join(', ')}`)
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const controller = new AbortController()
  rl.on('SIGINT', () => { controller.abort(); rl.close() })
  rl.on('close', () => controller.abort())
  const ask = async (label: string, fallback = '') => {
    const answer = await rl.question(`${label}${fallback ? ` [${fallback}]` : ''}: `, { signal: controller.signal })
    return answer.trim() || fallback
  }
  const choose = async (label: string, options: string[]) => {
    console.log(`\n${label}`)
    options.forEach((option, index) => console.log(`  ${index + 1}. ${option}`))
    while (true) {
      const answer = await ask('Choose a number')
      const index = Number(answer) - 1
      if (Number.isInteger(index) && index >= 0 && index < options.length) return index
      console.log(`Enter a number from 1 to ${options.length}.`)
    }
  }
  try {
    const action = await choose('Tabs', ['View current tabs', 'Add a tab', 'Delete a tab', 'Exit'])
    if (action === 3) return null
    const shells = Object.keys(SHELLS)
    const options = action === 0 ? ['All shells', ...shells] : shells
    const shell = typeof args.shell === 'string' ? args.shell : options[await choose('Shell', options)]
    const next: Record<string, string | boolean> = {}
    if (args['dry-run']) next['dry-run'] = true
    if (shell !== 'All shells') next.shell = shell
    if (action === 0) return { ...next, list: true }
    const tabs = listPanelRoutes(readFileSync(join(root, SHELLS[shell].shellFile), 'utf8'))
    if (action === 2) {
      if (!tabs.length) { console.log('No tabs to delete.'); return null }
      const tab = tabs[await choose('Tab to delete', tabs.map((tab) => `${tab.label} (${tab.id}) — ${tab.href}`))]
      next.id = tab.id
      next.delete = true
      const spec = resolveSpec({ shell, id: tab.id })
      next.file = await ask('Page filename (use the original custom filename, if any)', spec.file)
    } else {
      let spec: ReturnType<typeof resolveSpec>
      while (true) {
        const id = await ask('Tab ID (e.g. audit-log)')
        try {
          spec = resolveSpec({ shell, id })
          if (tabs.some((tab) => tab.id === spec.id)) throw new Error(`Tab '${spec.id}' already exists. Choose a new ID.`)
          break
        } catch (error) { console.log(error instanceof Error ? error.message : String(error)) }
      }
      next.id = spec.id
      const safeText = async (label: string, fallback: string) => {
        while (true) {
          const value = await ask(label, fallback)
          if (!/['\\\r\n]/.test(value)) return value
          console.log('Avoid apostrophes, backslashes, and newlines in generated values.')
        }
      }
      next.label = await safeText('Label', spec.label)
      next.icon = await safeText('Icon', spec.icon)
      if ((await ask('Customize short label, path, link, and filename? (y/N)', 'n')).toLowerCase().startsWith('y')) {
        next['short-label'] = await safeText('Short label', String(next.label))
        next.path = await safeText('Route path', spec.path)
        next.href = await safeText('Tab link', `${SHELLS[shell].baseHref}/${next.path}`)
        next.file = await safeText('Page filename', spec.file)
      }
    }
    if (!next['dry-run']) next['dry-run'] = (await choose('Run mode', ['Preview changes only', 'Apply changes'])) === 0
    return next
  } catch (error) {
    if (controller.signal.aborted) { console.log('\nCancelled; nothing changed.'); return null }
    throw error
  } finally { rl.close() }
}

async function main(): Promise<void> {
  try {
    if (interactive) {
      const answers = await promptForArgs()
      if (!answers) return
      args = answers
    }
    if ('list' in args) {
      if (args.list !== true) throw new Error('--list does not take a value.')
      for (const flag of Object.keys(args)) {
        if (!['list', 'shell', 'dry-run'].includes(flag)) throw new Error(`--${flag} cannot be combined with --list.`)
      }
      if (args.shell === true) throw new Error('Missing value for --shell.')
      const shells = typeof args.shell === 'string' ? [args.shell] : Object.keys(SHELLS)
      for (const shell of shells) {
        if (!Object.hasOwn(SHELLS, shell)) throw new Error(`Unknown shell "${shell}". Known: ${Object.keys(SHELLS).join(', ')}`)
        const tabs = listPanelRoutes(readFileSync(join(root, SHELLS[shell].shellFile), 'utf8'))
        console.log(`${shell} (${tabs.length} tabs)`)
        if (tabs.length) console.table(tabs)
        else console.log('No tabs.')
      }
      return
    }
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

    if (interactive && !(await confirm('Apply these changes? [y/N] '))) {
      console.log('Aborted; nothing changed.')
      return
    }

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
