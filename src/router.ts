import { isLegalDocumentSlug } from '@/lib/legal/documents'
import NotFound from '@/routes/not-found.btsx'
import Pending from '@/routes/pending.btsx'
import RootLayout from '@/routes/root-layout.btsx'
import type { RouteComponent } from '@octanejs/tanstack-router'
import { createRootRoute, createRoute, createRouter, lazyRouteComponent, notFound } from '@octanejs/tanstack-router'

// The 0.1.48 binding's runtime preload contract accepts an optional promise,
// while its RouteComponent type requires one. Keep that version-specific gap here.
const lazyRoute = (importer: () => Promise<unknown>) => lazyRouteComponent(importer) as unknown as RouteComponent

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRoute(() => import('./pages/root-page.btsx'))
})

const adminHandoffRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'admin-handoff',
  component: lazyRoute(() => import('./routes/admin-handoff.btsx'))
})

const adminOverviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'admin-overview',
  component: lazyRoute(() => import('./pages/admin-overview-page.btsx'))
})

const adminSnapsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'admin-snaps',
  component: lazyRoute(() => import('./pages/admin-snaps-page.btsx'))
})

// Fixture-backed UI surface. Deliberately outside the admin session gate; it
// renders generated rows and issues no queries.
const adminSnapsLabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'admin-snaps-lab',
  component: lazyRoute(() => import('./pages/admin-snaps-lab-page.btsx'))
})

const adminWorkspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'admin-workspace',
  component: lazyRoute(() => import('./pages/admin-workspace-page.btsx'))
})

const adminSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'admin-settings',
  component: lazyRoute(() => import('./pages/admin-settings-page.btsx'))
})

// `citadel-page.btsx` is a shell — nav plus an `Outlet` — so it only renders
// content through its children below.
const citadelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'citadel',
  component: lazyRoute(() => import('./pages/citadel-page.btsx'))
})

const citadelIndexRoute = createRoute({
  getParentRoute: () => citadelRoute,
  path: '/',
  component: lazyRoute(() => import('./pages/citadel-overview-page.btsx'))
})

// `citadel-accounts-page.btsx` renders its tab bar above an `Outlet`, the same
// shape as the settings shell; these are the panels its `panelRoutes` point at.
const citadelAccountsRoute = createRoute({
  getParentRoute: () => citadelRoute,
  path: 'accounts',
  component: lazyRoute(() => import('./pages/citadel-accounts-page.btsx'))
})

const citadelAccountsIndexRoute = createRoute({
  getParentRoute: () => citadelAccountsRoute,
  path: '/',
  component: lazyRoute(() => import('./pages/citadel-accounts-directory-page.btsx'))
})

const citadelAccountDetailRoute = createRoute({
  getParentRoute: () => citadelAccountsRoute,
  path: '$accountSlug',
  component: lazyRoute(() => import('./pages/citadel-account-detail-page.btsx'))
})

const citadelSettingsRoute = createRoute({
  getParentRoute: () => citadelRoute,
  path: 'settings',
  component: lazyRoute(() => import('./pages/citadel-settings-page.btsx'))
})

// `citadel-settings-page.btsx` renders its tab bar above an `Outlet`; these are
// the panels its `panelRoutes` point at, one child per tab.
const citadelSettingsIndexRoute = createRoute({
  getParentRoute: () => citadelSettingsRoute,
  path: '/',
  component: lazyRoute(() => import('./pages/citadel-settings-general-page.btsx'))
})

const citadelSettingsGodsRoute = createRoute({
  getParentRoute: () => citadelSettingsRoute,
  path: 'gods',
  component: lazyRoute(() => import('./pages/citadel-settings-gods-page.btsx'))
})

const snapsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'snaps',
  component: lazyRoute(() => import('./pages/snaps-page.btsx'))
})

const snapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'snaps/$snapId',
  component: lazyRoute(() => import('./routes/snap-route.btsx'))
})

const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'account',
  component: lazyRoute(() => import('./pages/user-account-page.btsx'))
})

const legalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'legal/$slug',
  beforeLoad: ({ params }) => {
    if (!isLegalDocumentSlug(params.slug)) throw notFound()
  },
  component: lazyRoute(() => import('./routes/legal-route.btsx')),
  notFoundComponent: NotFound
})

const routeTree = rootRoute.addChildren([
  homeRoute,
  adminHandoffRoute,
  adminOverviewRoute,
  adminSnapsRoute,
  adminSnapsLabRoute,
  adminWorkspaceRoute,
  adminSettingsRoute,
  citadelRoute.addChildren([
    citadelIndexRoute,
    citadelAccountsRoute.addChildren([citadelAccountsIndexRoute, citadelAccountDetailRoute]),
    citadelSettingsRoute.addChildren([citadelSettingsIndexRoute, citadelSettingsGodsRoute])
  ]),
  snapsRoute,
  snapRoute,
  accountRoute,
  legalRoute
])

export const router = createRouter({
  routeTree,
  scrollRestoration: true,
  defaultPendingComponent: Pending
})

declare module '@octanejs/tanstack-router' {
  interface Register {
    router: typeof router
  }
}
