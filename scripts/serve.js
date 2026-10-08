// Development server: serves the repository as static files (the app is plain ES modules, no build step).
//   node scripts/serve.js [port]   then open http://localhost:<port>/web/
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PORT = Number(process.argv[2] || process.env.PORT || 8770);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".md": "text/markdown; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".wasm": "application/wasm", ".map": "application/json" };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  let path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(path)).isDirectory()) path = join(path, "index.html");
    const body = await readFile(path);
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(url.pathname === "/" ? 302 : 404, url.pathname === "/" ? { Location: "/web/" } : {}).end();
  }
}).listen(PORT, () => console.log(`PRISMA Studio: http://localhost:${PORT}/web/`));
