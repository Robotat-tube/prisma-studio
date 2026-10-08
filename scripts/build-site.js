// Builds the static site for GitHub Pages / Cloudflare Pages / Netlify into dist/:
// the page (web/), the engine (src/) and a copy of pdf.js (vendor/). No bundler: the files are ES modules.
//   node scripts/build-site.js        then publish dist/ (its index.html opens web/)
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, ".."), DIST = join(ROOT, "dist");
const PDFJS = join(ROOT, "node_modules", "pdfjs-dist", "build");

await rm(DIST, { recursive: true, force: true });
await mkdir(join(DIST, "vendor"), { recursive: true });
await cp(join(ROOT, "web"), join(DIST, "web"), { recursive: true });
await cp(join(ROOT, "src"), join(DIST, "src"), { recursive: true, filter: p => !p.endsWith("node-folder.js") });   // Node-only adapter
for (const f of ["pdf.mjs", "pdf.worker.mjs"]) await cp(join(PDFJS, f), join(DIST, "vendor", f));
await cp(join(ROOT, "node_modules", "pdfjs-dist", "LICENSE"), join(DIST, "vendor", "pdfjs-LICENSE"));

const index = join(DIST, "web", "index.html");
const html = (await readFile(index, "utf8"))
  .replace("../node_modules/pdfjs-dist/build/pdf.mjs", "../vendor/pdf.mjs")
  .replace("../node_modules/pdfjs-dist/build/pdf.worker.mjs", "../vendor/pdf.worker.mjs");
if (html.includes("node_modules")) throw new Error("index.html still points into node_modules");
await writeFile(index, html);
await writeFile(join(DIST, "index.html"), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=web/"><title>PRISMA Studio</title><a href="web/">PRISMA Studio</a>\n');
console.log("dist/ ready: publish it as a static site (opens web/).");
