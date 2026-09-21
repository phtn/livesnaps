import { expect, test } from "vitest"
import {
  addToAddChildren,
  buildPlaceholderPage,
  insertPanelRoute,
  insertRouteConst,
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
