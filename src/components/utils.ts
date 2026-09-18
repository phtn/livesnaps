import type { ComponentBody, OctaneNode } from 'octane'
import { lazy } from 'octane'

/** What `lazyComponent` hands back: an ordinary component, plus `lazy`'s label. */
export type LazyComponent<P> = ((props: P) => OctaneNode) & { displayName?: string }

/**
 * `lazy()` for a `.btsx` module.
 *
 * Two mismatches are bridged here, both at this one boundary:
 *
 * 1. Octane's `lazy` is typed in terms of `ComponentBody`, its COMPILED-internal
 *    signature — `(props, scope, extra) => void`. The JSX-facing component type
 *    is `(props: P) => OctaneNode`, as `Component` below and the table binding's
 *    own `TableComponentType` both are. Handing back the former makes the
 *    checker see a component with NO props, so rendering it with any attribute
 *    fails with "Property 'x' does not exist on type 'IntrinsicAttributes'".
 * 2. A `.btsx` module only describes itself as `{ default: ComponentBody }`
 *    through the ambient `declare module '*.btsx'` in `env.d.ts`; once the TSRX
 *    language service resolves the real file it reports the module's own shape,
 *    which does not match. That is why `tsrx-tsc` accepts a bare
 *    `lazy(() => import('./X.btsx'))` and the editor does not.
 *
 * `P` has no inference site, so pass it explicitly when the component takes
 * props — and from a `.ts` module, because a named type import from a `.btsx`
 * specifier does not resolve under `tsrx-tsc` (the ambient declaration exposes
 * only a default export).
 */
export const lazyComponent = <P = unknown>(
  load: () => Promise<{ default?: unknown }>
): LazyComponent<P> =>
  lazy(() => load().then((module) => ({ default: module.default as ComponentBody<P> }))) as unknown as LazyComponent<P>

type Component<P = object> = (props: P) => OctaneNode
export type ComponentProps<T> = T extends Component<infer P> ? P : never

type O<T> = {
  current: T | null
}
export type RefObject<T> = O<T>

/*
Drawer.Root(open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen} direction='left')
      div(className='fixed top-0 z-35 w-full bg-sunken flex items-center justify-between h-12 border-b border-sidebar-border px-2.5')
        Drawer.Trigger(type='button' aria-label='Open admin navigation' className='fixed h-7! left-2 top-2 z-20 gap-2 inline-flex items-center justify-center text-foreground')
          Icon(name='sidebar' className='size-6 text-foreground/70')
          h1(className='mt-0.75 inline-flex items-center gap-0 font-poly font-medium text-foreground/90 tracking-tight')
            span(className='uppercase text-beach dark:text-foreground') Live
            span(className='uppercase dark:text-lime-200') Snaps
            span(className='text-sand dark:text-foreground') Now
      Drawer.Portal
        Drawer.Overlay(className='fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]')
        Drawer.Content(className='fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sunken! shadow-2xl outline-none')
          Drawer.Title(className='sr-only') Admin navigation
          div(className='flex h-16 items-center border-b border-border/70 px-6')
            Link(className='inline-flex items-center gap-2 text-[clamp(1.2rem,3vw,1.6rem)] font-poly font-medium text-foreground/90 tracking-tight' to='/' aria-label='App home')
              h1(className='')
                span(className='uppercase text-beach dark:text-foreground') Live
                span(className='uppercase dark:text-lime-200') Snaps
                span(className='text-sand dark:text-foreground') Now
*/
