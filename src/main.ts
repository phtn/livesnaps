import { NuqsAdapter } from '@octanejs/nuqs/adapters/react'
import { RouterProvider } from '@octanejs/tanstack-router'
import { createElement, createRoot } from 'octane'
import ThemeProvider from './components/theme-provider.btsx'
import { applyTheme, getPreferredTheme } from './lib/theme'
import { router } from './router'
import './style.css'

/**
 * True for every local host, subdomains included.
 *
 * The admin app runs on `admin.localhost`, which an exact-match list misses —
 * a service worker then installs in development and keeps serving hashed
 * chunks from a previous build after a rebuild has renamed them.
 *
 * `public/service-worker.js` carries the same check; it is a plain file served
 * as-is rather than a bundled module, so it cannot import this one.
 */
const isLocalHostname = (hostname: string) =>
  hostname === 'localhost' ||
  hostname.endsWith('.localhost') ||
  hostname === '127.0.0.1' ||
  hostname === '[::1]' ||
  hostname === '::1'

const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return

  if (isLocalHostname(window.location.hostname)) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    void caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith('livesnaps-shell-')).map((key) => caches.delete(key)))
      )
    return
  }

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // Service worker support is an enhancement; the app remains usable without it.
    })
  })
}

const container = document.getElementById('app')
if (container === null) throw new Error('Missing #app container.')

applyTheme(getPreferredTheme())
registerServiceWorker()

const root = createRoot(container)
root.render(ThemeProvider, {
  // NuqsAdapter drives table/search state straight off the query string. It
  // sits inside the theme provider but outside the router so every route can
  // read and write search params.
  children: createElement(NuqsAdapter, {
    children: createElement(RouterProvider, { router })
  })
})
