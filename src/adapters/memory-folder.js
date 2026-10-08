/**
 * Folder adapter kept in memory: for unit tests and for trying the app without touching disk.
 * @module adapters/memory-folder
 */

/**
 * @param {Record<string, string | Uint8Array>} [files] initial files by path
 * @returns {import("../ports/folder.js").Folder & {files: Map<string, string | Uint8Array>}}
 */
export function memoryFolder(files = {}, name = "memory") {
  const store = new Map(Object.entries(files));
  const dirs = new Set();
  const clean = p => String(p).split("/").filter(Boolean).join("/");
  const missing = p => Object.assign(new Error(`No such file: ${p}`), { code: "ENOENT" });
  const read = p => { if (!store.has(clean(p))) throw missing(p); return store.get(clean(p)); };
  return {
    name,
    files: store,
    exists: async p => store.has(clean(p)) || dirs.has(clean(p)) || [...store.keys()].some(k => k.startsWith(clean(p) + "/")),
    readText: async p => { const v = read(p); return typeof v === "string" ? v : new TextDecoder().decode(v); },
    writeText: async (p, text) => { store.set(clean(p), String(text)); },
    appendText: async (p, text) => { store.set(clean(p), (store.has(clean(p)) ? String(store.get(clean(p))) : "") + text); },
    readBytes: async p => { const v = read(p); return typeof v === "string" ? new TextEncoder().encode(v) : v; },
    writeBytes: async (p, bytes) => { store.set(clean(p), bytes); },
    list: async dir => {
      const prefix = clean(dir) ? clean(dir) + "/" : "";
      const names = new Set([...store.keys()].filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length).split("/")[0]));
      return [...names].sort();
    },
    makeDir: async dir => { dirs.add(clean(dir)); },
  };
}
