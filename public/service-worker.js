const CACHE_NAME = 'livesnaps-shell-v1'
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

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(CACHE_NAME).then((cache) => cache.put('/', copy))
          }
          return response
        })
        .catch(() => caches.match('/'))
    )
    return
  }

  if (new URL(request.url).pathname.startsWith('/api/')) return

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      })
    })
  )
})
