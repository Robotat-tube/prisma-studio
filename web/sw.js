// Offline support. On install it stores every file of the app (listed in precache.json); afterwards each request
// goes to the server first and falls back to the stored copy, so the app opens without a server or a network,
// and edits to the app still show up as soon as the server is back. Review folders never pass through here.
const CACHE = "prisma-studio";

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const files = await (await fetch("precache.json", { cache: "no-store" })).json();
    await cache.addAll(["/web/", ...files]);
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
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return (await cache.match(req, { ignoreSearch: true })) ?? Response.error();
    }
  })());
});
