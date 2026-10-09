// The files the offline service worker (web/sw.js) stores on first visit: the page, the engine and pdf.js.
// Paths are relative to web/ (where sw.js is), so the site also works in a subfolder (GitHub Pages: /prisma-studio/).
// Used by serve.js (from the repository) and build-site.js (from dist/).
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}

/** @param {string} root site root; @param {string[]} pdfjs paths of pdf.mjs and pdf.worker.mjs below root */
export async function precacheList(root, pdfjs) {
  const files = [...await walk(join(root, "web")), ...await walk(join(root, "src"))]
    .filter(p => !p.endsWith("node-folder.js") && !p.endsWith("sw.js"));
  const fromWeb = p => relative(join(root, "web"), join(root, p)).split("\\").join("/");
  return [...files.map(p => fromWeb(relative(root, p))), ...pdfjs.map(fromWeb)].map(p => (p.startsWith(".") ? p : "./" + p));
}
