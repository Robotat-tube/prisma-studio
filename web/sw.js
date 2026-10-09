// Offline support. On install it stores every file of the app (listed in precache.json); afterwards each request
// goes to the server first and falls back to the stored copy, so the app opens without a server or a network,
// and edits to the app still show up as soon as the server is back. Review folders never pass through here.
const CACHE = "prisma-studio";

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const files = await (await fetch("precache.json", { cache: "no-store" })).json();
    await cache.addAll(["./", ...files].map(url => new Request(url, { cache: "reload" })));   // relative to sw.js; never the browser's cached copy
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;   // OpenAlex etc. go to the network as usual
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // always ask the server (it answers "not modified" when nothing changed): the browser's own cache could
      // otherwise mix a new page with an old script after an update
      const res = await (req.mode === "navigate" ? fetch(req.url, { cache: "no-cache", credentials: "same-origin" }) : fetch(req, { cache: "no-cache" }));
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return (await cache.match(req, { ignoreSearch: true })) ?? Response.error();
    }
  })());
});
