// /matmurti/sw.js: retires the copy of the web app that was served at
// /matmurti/ until it moved to /matmurti/app/.
//
// Browsers that opened the app at /matmurti/ keep its service worker,
// which would go on serving that old copy from its cache. When it next
// checks for an update it gets this file instead, which removes itself and
// the old caches and sends every open page to the app at /matmurti/app/.
// The data is untouched: it belongs to the origin (IndexedDB "matmurti",
// localStorage "matmurti.*"), not to a path, so the app finds it there.
'use strict';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // The old copy's caches; the app's own ("matmurti-app-") stay.
    for (const name of await caches.keys()) {
      if (name.startsWith('matmurti-') && !name.startsWith('matmurti-app-')) {
        await caches.delete(name);
      }
    }
    const pages = await self.clients.matchAll({ type: 'window' });
    await self.registration.unregister();
    const app = new URL('app/', self.registration.scope).href;
    for (const page of pages) {
      try { await page.navigate(app); } catch (e) {}
    }
  })());
});

// Until it is gone, never answer from the old cache.
self.addEventListener('fetch', () => {});
