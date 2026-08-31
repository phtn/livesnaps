import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  notFound
} from '@octanejs/tanstack-router'
import type { RouteComponent } from '@octanejs/tanstack-router'
import { isLegalDocumentSlug } from '@/lib/legal/documents'
import NotFound from '@/routes/not-found.btsx'
import Pending from '@/routes/pending.btsx'

// The 0.1.48 binding's runtime preload contract accepts an optional promise,
// while its RouteComponent type requires one. Keep that version-specific gap here.
const lazyRoute = (importer: () => Promise<unknown>) =>
  lazyRouteComponent(importer) as unknown as RouteComponent

const rootRoute = createRootRoute({
  notFoundComponent: NotFound
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRoute(() => import('./App.btsx'))
})

const snapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'snaps/$snapId',
  component: lazyRoute(() => import('./routes/snap-route.btsx'))
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

const routeTree = rootRoute.addChildren([homeRoute, snapRoute, legalRoute])

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
