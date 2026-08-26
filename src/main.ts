import { createRoot } from 'octane'
import App from './App.btsx'
import { applyTheme, getPreferredTheme } from './lib/theme'
import './style.css'

const container = document.getElementById('app')
if (container === null) throw new Error('Missing #app container.')

applyTheme(getPreferredTheme())

createRoot(container).render(App, { docsUrl: 'https://beast-docs.vercel.app' })
