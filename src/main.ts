import { createElement, createRoot } from 'octane'
import ThemeProvider from './components/theme-provider.btsx'
import { applyTheme, getPreferredTheme } from './lib/theme'
import './style.css'

const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(() => {
      // Service worker support is an enhancement; the app remains usable without it.
    })
  })
}

const container = document.getElementById('app')
if (container === null) throw new Error('Missing #app container.')

applyTheme(getPreferredTheme())
registerServiceWorker()

const root = createRoot(container)

void import('./App.btsx').then(({ default: App }) => {
  root.render(ThemeProvider, {
    children: createElement(App, { docsUrl: 'https://beast-docs.vercel.app' })
  })
})
