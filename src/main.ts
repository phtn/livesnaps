import { createElement, createRoot } from 'octane'
import App from './App.btsx'
import ThemeProvider from './components/theme-provider.btsx'
import { applyTheme, getPreferredTheme } from './lib/theme'
import './style.css'

const container = document.getElementById('app')
if (container === null) throw new Error('Missing #app container.')

applyTheme(getPreferredTheme())

createRoot(container).render(ThemeProvider, {
  children: createElement(App, { docsUrl: 'https://beast-docs.vercel.app' }),
})
