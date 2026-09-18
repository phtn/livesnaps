import type { ComponentBody, OctaneNode } from 'octane'
import { lazy } from 'octane'

/**
 * `lazy()` for a `.btsx` module.
 *
 * Octane's `lazy` wants `{ default: ComponentBody }`, and `ComponentBody` is
 * `(props, scope, extra) => void`. A `.btsx` module only describes itself that
 * way through the ambient `declare module '*.btsx'` in `env.d.ts`; once the TSRX
 * language service resolves the real file it reports the module's own shape,
 * which does not match. That is why `tsrx-tsc` accepts a bare
 * `lazy(() => import('./X.btsx'))` and the editor rejects it.
 *
 * Normalising here keeps the one assertion in a single place rather than at
 * every lazy call site, and works under either resolution.
 */
export const lazyComponent = <P = any>(load: () => Promise<{ default?: unknown }>) =>
  lazy<ComponentBody<P>>(() => load().then((module) => ({ default: module.default as ComponentBody<P> })))

type Component<P = {}> = (props: P) => OctaneNode
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
