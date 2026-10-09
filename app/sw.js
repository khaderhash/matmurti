// مطمورتي service worker: makes the app open fully offline after the first
// visit, and installs new versions in the background until the user taps
// «حدّث». tool/web/build.dart writes the build's file list into MANIFEST.
//
// - core: every file the app needs whatever the browser. Precached.
// - groups: the renderer builds (wasm + skwasm, JS + CanvasKit, ...). The
//   browser downloads only one; the page reports which (see "used"), and
//   later versions precache that one.
// - lazy: fallback fonts and the licence notices. Cached when first used.
//
// Files are fetched with ?v=<hash> (GitHub Pages' CDN keys on the full URL,
// so a stale copy is never served) and checked against their SHA-256
// before they go into the cache.
'use strict';

const MANIFEST = {"version":"c4ec85d94411","core":{"app_shell.css":"18d07e5765b09790","app_shell.js":"2d27c351ae6af952","assets/AssetManifest.bin":"57f4de57da362ccd","assets/AssetManifest.bin.json":"9ec512dace40f941","assets/FontManifest.json":"e32d4948afe77963","assets/assets/brand/jar_shine.webp":"ad7016ce74036e83","assets/assets/brand/jar_tile.webp":"fe19e2ed12fe2f3c","assets/assets/fonts/Alexandria-OFL.txt":"56372aed19c2701f","assets/assets/fonts/Alexandria-VF.ttf":"db8ae03b62d55a65","assets/fonts/MaterialIcons-Regular.otf":"056ed96e21f98400","assets/shaders/ink_sparkle.frag":"5aee0e4ff369c055","assets/shaders/stretch_effect.frag":"c723fbb5b9a3456b","favicon.png":"f50b8b306a0fe2df","flutter.js":"a483fd28f51ed2fa","flutter_bootstrap.js":"cbc089c7535a23f5","fonts/roboto/v32/KFOmCnqEu92Fr1Me4GZLCzYlKw.woff2":"35b02ca266b79eb4","index.html":"a7134357e4e5cc57","manifest.json":"0d0eee5f052fc50d","sqflite_sw.js":"37b8b3c6f29d46d8","sqlite3.wasm":"fbcd2e8214f9231e","version.json":"a79da0a759ea019a"},"groups":{"skwasm":{"canvaskit/skwasm.js":"d52e58007af74083","canvaskit/skwasm.wasm":"f8bab54ad143745f","main.dart.mjs":"ec2bbdb891cc3955","main.dart.wasm":"1fe27905bf6ab87e"},"skwasm_heavy":{"canvaskit/skwasm_heavy.js":"7a1aa20e765441b2","canvaskit/skwasm_heavy.wasm":"33f5c52d1612df0a","main.dart.mjs":"ec2bbdb891cc3955","main.dart.wasm":"1fe27905bf6ab87e"},"canvaskit":{"canvaskit/canvaskit.js":"931ae3f02e76e8ac","canvaskit/canvaskit.wasm":"42e392d69fd05a85","main.dart.js":"27589278f5cd739d"},"canvaskit_chromium":{"canvaskit/chromium/canvaskit.js":"ff8dcd85cee32569","canvaskit/chromium/canvaskit.wasm":"2bf5ea09d70b8ead","main.dart.js":"27589278f5cd739d"}},"renderer":{"skwasm":"canvaskit/skwasm.wasm","skwasm_heavy":"canvaskit/skwasm_heavy.wasm","canvaskit":"canvaskit/canvaskit.wasm","canvaskit_chromium":"canvaskit/chromium/canvaskit.wasm"},"lazy":{"assets/NOTICES":"46afee24bad8de09","favicon.ico":"c2c73262f0f2b8cb","fonts/OFL.txt":"4469e000d18c8ff5","fonts/notocoloremoji/v32/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFabsE4tq3luCC7p-aXxcn.0.woff2":"928e12b560823ba9","fonts/notocoloremoji/v32/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFabsE4tq3luCC7p-aXxcn.1.woff2":"3d6dc79812ee744e","fonts/notocoloremoji/v32/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFabsE4tq3luCC7p-aXxcn.10.woff2":"203659edb0aed836","fonts/notocoloremoji/v32/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFabsE4tq3luCC7p-aXxcn.11.woff2":"385e562ebc59d03f","fonts/notocoloremoji/v32/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFabsE4tq3luCC7p-aXxcn.2.woff2":"c62ab44e5774c862","fonts/notocoloremoji/v32/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFabsE4tq3luCC7p-aXxcn.3.woff2":"51f31d10bc2be987","fonts/notocoloremoji/v32/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFabsE4tq3luCC7p-aXxcn.4.woff2":"23e92d2e456d91ea","fonts/notocoloremoji/v32/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFabsE4tq3luCC7p-aXxcn.5.woff2":"54c838d33459c441","fonts/notocoloremoji/v32/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFabsE4tq3luCC7p-aXxcn.6.woff2":"1880e91255718a7d","fonts/notocoloremoji/v32/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFabsE4tq3luCC7p-aXxcn.7.woff2":"ff36706720fd0d85","fonts/notocoloremoji/v32/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFabsE4tq3luCC7p-aXxcn.8.woff2":"ee9007c489ff2b25","fonts/notocoloremoji/v32/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFabsE4tq3luCC7p-aXxcn.9.woff2":"2c6df98bda8729b0","fonts/notosansarabic/v28/nwpxtLGrOAZMl5nJ_wfgRg3DrWFZWsnVBJ_sS6tlqHHFlhQ5l3sQWIHPqzCfyGyvvnCBFQLaig.woff2":"53251baf8845f9b2","fonts/notosanssymbols/v43/rP2up3q65FkAtHfwd-eIS2brbDN6gxP34F9jRRCe4W3gfQ8gb_VFRkzrbQ.woff2":"08202e258ea58325","fonts/notosanssymbols2/v24/I_uyMoGduATTei9eI8daxVHDyfisHr71-gTBWXPM4Q.woff2":"b0d885dae11e7fb2","fonts/notosanssymbols2/v24/I_uyMoGduATTei9eI8daxVHDyfisHr71-jrBWXPM4Q.woff2":"5824d50a6e4eca33","fonts/notosanssymbols2/v24/I_uyMoGduATTei9eI8daxVHDyfisHr71-pTgfA.woff2":"076185b66a4070d4","fonts/notosanssymbols2/v24/I_uyMoGduATTei9eI8daxVHDyfisHr71-prgfE71.woff2":"97f469061805041d","fonts/notosanssymbols2/v24/I_uyMoGduATTei9eI8daxVHDyfisHr71-ujgfE71.woff2":"2eb49cfc40ca8a57","fonts/notosanssymbols2/v24/I_uyMoGduATTei9eI8daxVHDyfisHr71-vrgfE71.woff2":"c90fbe98152bbb11","icons/Icon-192.png":"95aa77e9286ec8a1","icons/Icon-512.png":"edc35b67e9456bae","icons/Icon-maskable-192.png":"dd24a7a144768055","icons/Icon-maskable-512.png":"d1057624325653d5","icons/apple-touch-icon.png":"16b8e4eed3968992"}};

const VERSION = MANIFEST.version;
// "matmurti-app-": the app's own caches. (Plain "matmurti-" ones belong to
// the copy that was served at /matmurti/ before the move to /matmurti/app/;
// site/sw.js removes those.)
const CACHE = `matmurti-app-${VERSION}`;
const META = 'matmurti-app-meta';
const META_GROUPS = 'meta/groups.json';

const files = new Map(); // path -> hash, for every known file
for (const [path, hash] of Object.entries(MANIFEST.core)) files.set(path, hash);
for (const group of Object.values(MANIFEST.groups)) {
  for (const [path, hash] of Object.entries(group)) files.set(path, hash);
}
for (const [path, hash] of Object.entries(MANIFEST.lazy)) files.set(path, hash);

const scope = new URL(self.registration.scope);

/// 'canvaskit/skwasm.wasm' for any URL of this origin, else null.
function pathOf(url) {
  const u = new URL(url);
  if (u.origin !== scope.origin || !u.pathname.startsWith(scope.pathname)) {
    return null;
  }
  const path = u.pathname.slice(scope.pathname.length);
  return path === '' ? 'index.html' : path;
}

async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

/// Downloads [path] fresh from the server and stores it, after checking
/// it is exactly the file this version was built with.
async function fetchVerified(cache, path) {
  const hash = files.get(path);
  const url = new URL(path, scope);
  url.searchParams.set('v', hash);
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const body = await response.clone().arrayBuffer();
  if ((await sha256(body)) !== hash) throw new Error(`${path}: wrong content`);
  await cache.put(new URL(path, scope), response);
}

async function cacheAll(cache, paths) {
  const missing = [];
  for (const path of paths) {
    if (!(await cache.match(new URL(path, scope)))) missing.push(path);
  }
  // A few at a time: phones on slow networks.
  for (let i = 0; i < missing.length; i += 4) {
    await Promise.all(missing.slice(i, i + 4).map((p) => fetchVerified(cache, p)));
  }
}

async function usedGroups() {
  const meta = await caches.open(META);
  const stored = await meta.match(new URL(META_GROUPS, scope));
  return stored ? stored.json() : [];
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const paths = Object.keys(MANIFEST.core);
    for (const group of await usedGroups()) {
      if (MANIFEST.groups[group]) paths.push(...Object.keys(MANIFEST.groups[group]));
    }
    // Any failure (offline, a half-deployed site) fails the install; the
    // current version keeps running and the next check tries again.
    await cacheAll(cache, paths);
  })());
  // No skipWaiting here: a new version waits for «حدّث».
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== CACHE && name !== META && name.startsWith('matmurti-app-')) {
        await caches.delete(name);
      }
    }
    // The first install takes over the open page, so it works offline
    // from now on. Later versions only activate after «حدّث», and the
    // page reloads then.
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'skipWaiting') {
    self.skipWaiting();
  } else if (data.type === 'used') {
    // The page lists what it loaded: cache those files (a first visit
    // loads before this worker exists) and remember the renderer.
    event.waitUntil((async () => {
      const paths = [...new Set(data.urls.map(pathOf))]
        .filter((p) => p && files.has(p) && !(p in MANIFEST.lazy));
      // Told apart by the renderer binary (main.dart.wasm is shared).
      const groups = Object.keys(MANIFEST.groups).filter((g) =>
        paths.includes(MANIFEST.renderer[g]));
      const meta = await caches.open(META);
      await meta.put(new URL(META_GROUPS, scope),
        new Response(JSON.stringify(groups)));
      let ok = true;
      try {
        await cacheAll(await caches.open(CACHE), [
          ...Object.keys(MANIFEST.core),
          ...groups.flatMap((g) => Object.keys(MANIFEST.groups[g])),
        ]);
      } catch (e) {
        ok = false;
      }
      if (event.source) {
        event.source.postMessage({ type: 'cached', ok, version: VERSION, groups });
      }
    })());
  } else if (data.type === 'version' && event.source) {
    event.source.postMessage({ type: 'version', version: VERSION });
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  // Opening the app, from the icon or a link: the cached page.
  const path = request.mode === 'navigate' ? 'index.html' : pathOf(request.url);
  if (path === null || path === 'sw.js' || !files.has(path)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // ignoreSearch: sqflite_sw.js?v=1.1.0 is the same file.
    const cached = await cache.match(new URL(path, scope), { ignoreSearch: true });
    if (cached) return cached;
    try {
      await fetchVerified(cache, path);
      return await cache.match(new URL(path, scope));
    } catch (e) {
      return fetch(request);
    }
  })());
});
