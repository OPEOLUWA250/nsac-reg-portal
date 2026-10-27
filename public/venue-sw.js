// Offline venue map. Registered by the venue page (src/components/venue/
// useOfflineVenue.ts) with the scope /venue, so it controls that page only;
// nothing else on the site goes through it.
//
// - The page (/venue, whatever the ?from= or ?to=): from the network, so booth
//   names stay fresh, with the last saved copy when there's no signal. A QR
//   sticker scanned without signal still opens the map.
// - Its files (scripts, styles, fonts, the logo): saved once the page has
//   loaded (the page sends the list) and served from the save afterwards.
//   Each save replaces the previous one, so old builds don't pile up.
//
// Bump VERSION to drop every saved copy (e.g. if a bad save went out).

const VERSION = "v1";
const CACHE = `venue-${VERSION}`;
const PAGE = "/venue";
// No answer in this time counts as no signal (a weak venue network rarely fails fast).
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("venue-") && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

const sameOrigin = (url) => url.origin === self.location.origin;
const savable = (url) => sameOrigin(url) && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/admin");

// The page tells us what it loaded: { type: "save", urls }. We fetch the page
// and those files into the save, then drop anything older.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "save" || !Array.isArray(data.urls)) return;
  event.waitUntil(save(data.urls));
});

async function save(list) {
  const cache = await caches.open(CACHE);
  const urls = new Set([PAGE]);
  for (const raw of list) {
    try {
      const url = new URL(raw, self.location.origin);
      if (savable(url)) urls.add(url.pathname + url.search);
    } catch {
      /* not a URL */
    }
  }
  await Promise.all(
    [...urls].map(async (path) => {
      // Already saved: build files never change under the same name, and the
      // page is saved fresh on every visit with signal (see page()).
      if ((path === PAGE || path.startsWith("/_next/static/")) && (await cache.match(path))) return;
      try {
        const res = await fetch(path, { cache: "no-cache", credentials: "same-origin" });
        if (res.ok) await cache.put(path, res);
      } catch {
        /* offline or gone: keep what we had */
      }
    })
  );
  for (const req of await cache.keys()) {
    const url = new URL(req.url);
    if (!urls.has(url.pathname + url.search)) await cache.delete(req);
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate" && url.pathname === PAGE) {
    event.respondWith(page(req));
    return;
  }
  if (savable(url) && !url.pathname.startsWith(PAGE)) event.respondWith(file(req, url));
});

// Network first, the saved page when there's no signal.
async function page(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(req), NETWORK_TIMEOUT_MS);
    if (res.ok) await cache.put(PAGE, res.clone());
    return res;
  } catch {
    const saved = await cache.match(PAGE);
    if (saved) return saved;
    return new Response(
      "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Venue map</title>" +
        "<body style='font-family:system-ui,sans-serif;padding:2rem;color:#232323'><h1 style='color:#03416A'>No connection</h1>" +
        "<p>The venue map hasn't been saved on this phone yet. Open it once with a connection and it will work offline after that.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

// The saved copy if there is one, otherwise the network.
async function file(req, url) {
  const saved = await caches.match(url.pathname + url.search, { cacheName: CACHE });
  if (saved) return saved;
  return fetch(req);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
