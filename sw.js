// GitHub Pages replaces the local version with the commit SHA at deployment.
const VERSION = 'local-v1';
const scope = new URL(self.registration.scope);
const cachePrefix = `decision-playground:${scope.href}:`;
const cacheName = cachePrefix + VERSION;
const appUrl = new URL('./', scope).href;
const indexPath = new URL('index.html', scope).pathname;
const files = new Set([
  './',
  './styles.css',
  './app.js',
  './api.js',
  './decision.js',
  './examples.js',
  './recordings.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
].map(file => new URL(file, scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache =>
    cache.addAll([...files].map(url => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(cachePrefix) && name !== cacheName) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin) return;

  if (request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === indexPath)) {
    event.respondWith(fromCache(appUrl, request));
  } else if (files.has(url.href)) {
    event.respondWith(fromCache(url.href, request));
  }
});

async function fromCache(url, request) {
  const cache = await caches.open(cacheName);
  return (await cache.match(url)) ?? fetch(request);
}
