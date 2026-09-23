import { expect, test } from "vitest"
import {
  addToAddChildren,
  buildPlaceholderPage,
  insertPanelRoute,
  insertRouteConst,
  listPanelRoutes,
  removeFromAddChildren,
  removePanelRoute,
  removeRouteConst,
  resolveSpec
} from "../src/lib/codegen/tab-codegen.ts"

test("resolves tools spec with shell defaults", () => {
  const spec = resolveSpec({ shell: "citadel-settings", id: "tools", label: "Tools", icon: "tools" })
  expect(spec.href).toBe("/citadel/settings/tools")
  expect(spec.path).toBe("tools")
  expect(spec.file).toBe("citadel-settings-tools-page.btsx")
  expect(spec.routeConst).toBe("citadelSettingsToolsRoute")
})

test("inserts panel entry and router wiring idempotently", () => {
  const spec = resolveSpec({ shell: "citadel-settings", id: "tools", label: "Tools", icon: "tools" })
  const shell = `  export const panelRoutes: readonly PanelRoute[] = [\n    { id: 'settings', href: '/citadel/settings', label: 'Settings', shortLabel: 'Settings', icon: 'settings' },\n  ]\n`
  const withTab = insertPanelRoute(shell, spec)
  expect(withTab).toContain(`id: 'tools'`)
  expect(withTab).toContain(`href: '/citadel/settings/tools'`)
  // The `[]` in the type annotation must survive; the entry lands in the array body.
  expect(withTab).toContain(`readonly PanelRoute[] = [`)
  expect(withTab.indexOf(`id: 'tools'`)).toBeGreaterThan(withTab.indexOf(`= [`))
  // Indentation survives: entry aligns with siblings, `]` keeps its indent.
  expect(withTab).toContain(`\n    { id: 'tools', href: '/citadel/settings/tools', label: 'Tools', shortLabel: 'Tools', icon: 'tools' },\n  ]`)
  expect(insertPanelRoute(withTab, spec)).toBe(withTab)

  const router = `const citadelSettingsRoute = createRoute({ path: 'settings' })\n\nconst routeTree = rootRoute.addChildren([\n  citadelRoute.addChildren([\n    citadelSettingsRoute.addChildren([citadelSettingsIndexRoute])\n  ]),\n])\n`
  const wired = addToAddChildren(insertRouteConst(router, spec, "citadelSettingsRoute"), "citadelSettingsRoute", spec.routeConst)
  expect(wired).toContain(`const citadelSettingsToolsRoute = createRoute`)
  expect(wired).toContain(`path: 'tools'`)
  expect(wired).toContain(`citadelSettingsToolsRoute`)
})

test("removes panel entry and router wiring, round-tripping an insert", () => {
  const spec = resolveSpec({ shell: "citadel-settings", id: "tools", label: "Tools", icon: "tools" })
  const shell = `  export const panelRoutes: readonly PanelRoute[] = [\n    { id: 'settings', href: '/citadel/settings', label: 'Settings', shortLabel: 'Settings', icon: 'settings' },\n  ]\n`
  const withTab = insertPanelRoute(shell, spec)
  expect(removePanelRoute(withTab, "tools")).toBe(shell)
  expect(removePanelRoute(shell, "missing")).toBe(shell)

  const router = `const citadelSettingsRoute = createRoute({ path: 'settings' })\n\nconst routeTree = rootRoute.addChildren([\n  citadelRoute.addChildren([\n    citadelSettingsRoute.addChildren([citadelSettingsIndexRoute])\n  ]),\n])\n`
  const wired = addToAddChildren(insertRouteConst(router, spec, "citadelSettingsRoute"), "citadelSettingsRoute", spec.routeConst)
  const unwired = removeRouteConst(removeFromAddChildren(wired, "citadelSettingsRoute", spec.routeConst), spec.routeConst)
  expect(unwired).toBe(router)
  expect(removeRouteConst(router, spec.routeConst)).toBe(router)
})

test("placeholder page points at its own file", () => {
  const spec = resolveSpec({ shell: "citadel-settings", id: "tools", label: "Tools", icon: "tools" })
  const body = buildPlaceholderPage(spec)
  expect(body).toContain("InnerContainer")
  expect(body).toContain("citadel-settings-tools-page.btsx")
})

test("lists literal tabs in source order without executing source", () => {
  const source = `throw new Error('must not execute')
  export const panelRoutes: readonly PanelRoute[] = [
    // { id: 'ignored' }
    { id: 'account', label: "Account's info", href: '/admin-settings', shortLabel: 'Account', icon: 'account' },
    {
      id: 'tools', label: 'Tools', href: '/admin-settings/tools'
    }
  ]`
  expect(listPanelRoutes(source)).toEqual([
    { id: 'account', label: "Account's info", href: '/admin-settings', shortLabel: 'Account', icon: 'account' },
    { id: 'tools', label: 'Tools', href: '/admin-settings/tools', shortLabel: 'Tools', icon: '' }
  ])
  expect(listPanelRoutes('export const panelRoutes = []')).toEqual([])
})

test("rejects dynamic tabs instead of evaluating them or silently omitting them", () => {
  expect(() => listPanelRoutes('export const panelRoutes = [getTab()]')).toThrow('literal panelRoutes entries')
  expect(() => listPanelRoutes("export const panelRoutes = [{ id: 'tools', label: getLabel(), href: '/tools' }]")).toThrow('string literal')
})

test.each([
  "{ id: 'account' }",
  "{ id: 'account' },",
  "{ id: 'account' } // final entry",
  "{ id: 'account' } /* trailing comment with ] */",
  "{ id: 'account' }, // final entry",
  "",
  "// no entries yet"
])("appends valid array syntax after %j", (body) => {
  const spec = resolveSpec({ shell: "admin-settings", id: "test" })
  const source = `  export const panelRoutes: readonly PanelRoute[] = [\n    ${body}\n  ]\n`
  const result = insertPanelRoute(source, spec)
  const arraySource = result.slice(result.indexOf("= ") + 2)
  const entries = new Function(`return (${arraySource})`)()
  expect(entries.map((entry: { id: string }) => entry.id)).toEqual(
    body.includes("account") ? ["account", "test"] : ["test"]
  )
  expect(result).toContain("\n  ]\n")
  expect(insertPanelRoute(result, spec)).toBe(result)
})
