const CACHE_NAME = 'livesnaps-shell-v3'
const IS_LOCAL_DEVELOPMENT = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname)
const APP_SHELL = [
  '/',
  '/site.webmanifest',
  '/livesnaps-icons/favicon.ico',
  '/livesnaps-icons/apple-icon.png',
  '/livesnaps-icons/icon-192.png',
  '/livesnaps-icons/icon-512.png'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    fetch('/')
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load the app shell.')

        const shell = await response.clone().text()
        const emittedAssets = [...shell.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map(
          ([, asset]) => asset
        )
        const cache = await caches.open(CACHE_NAME)
        await cache.put('/', response)
        await cache.addAll([...APP_SHELL.filter((path) => path !== '/'), ...emittedAssets])
      })
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

const fetchAndCache = async (request, cacheKey = request) => {
  const response = await fetch(request)

  if (response.ok) {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(cacheKey, response.clone())
  }

  return response
}

const cachedResponse = async (request, fallback) => {
  const cached = await caches.match(request)
  if (cached) return cached

  if (fallback) {
    const fallbackResponse = await caches.match(fallback)
    if (fallbackResponse) return fallbackResponse
  }

  throw new Error(`No cached response is available for ${request.url}`)
}

self.addEventListener('fetch', (event) => {
  if (IS_LOCAL_DEVELOPMENT) return

  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetchAndCache(request, '/').catch(() => cachedResponse(request, '/'))
    )
    return
  }

  if (new URL(request.url).pathname.startsWith('/api/')) return

  event.respondWith(fetchAndCache(request).catch(() => cachedResponse(request)))
})
