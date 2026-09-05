import { NuqsAdapter } from '@octanejs/nuqs/adapters/react'
import { RouterProvider } from '@octanejs/tanstack-router'
import { createElement, createRoot } from 'octane'
import ThemeProvider from './components/theme-provider.btsx'
import { applyTheme, getPreferredTheme } from './lib/theme'
import { router } from './router'
import './style.css'

const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return

  if (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
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
