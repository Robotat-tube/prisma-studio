/**
 * Folder adapter for the browser: a folder the user picked, through the File System Access API
 * (Chrome, Edge). Text is read with universal newlines and written with "\n", as the Node adapter does.
 * @module adapters/browser-folder
 */
import { normalizeNewlines } from "../domain/pytext.js";

const parts = path => String(path).split("/").filter(Boolean);

/** The directory handle at a path inside root (null when missing; created when `create`). */
async function dirAt(root, path, create = false) {
  let dir = root;
  for (const name of parts(path)) {
    try { dir = await dir.getDirectoryHandle(name, { create }); } catch { return null; }
  }
  return dir;
}

/** The file handle at a path inside root (null when missing; created with its folders when `create`). */
async function fileAt(root, path, create = false) {
  const p = parts(path), name = p.pop();
  const dir = await dirAt(root, p.join("/"), create);
  if (!dir || !name) return null;
  try { return await dir.getFileHandle(name, { create }); } catch { return null; }
}

const missing = path => Object.assign(new Error(`No such file: ${path}`), { code: "ENOENT" });

/**
 * @param {FileSystemDirectoryHandle} root a folder the user granted read/write access to
 * @returns {import("../ports/folder.js").Folder}
 */
export function browserFolder(root) {
  const file = async path => {
    const handle = await fileAt(root, path);
    if (!handle) throw missing(path);
    return handle.getFile();
  };
  const write = async (path, data) => {
    const writable = await (await fileAt(root, path, true)).createWritable();
    await writable.write(data);
    await writable.close();
  };
  return {
    name: root.name,
    exists: async path => !parts(path).length || Boolean((await fileAt(root, path)) || (await dirAt(root, path))),
    isDirectory: async path => Boolean(await dirAt(root, path)),
    lastModified: async path => (await file(path)).lastModified,
    readText: async path => normalizeNewlines(await (await file(path)).text()),
    readBytes: async path => new Uint8Array(await (await file(path)).arrayBuffer()),
    writeText: (path, text) => write(path, text),
    writeBytes: (path, bytes) => write(path, bytes),
    appendText: async (path, text) => {
      const handle = await fileAt(root, path);
      await write(path, (handle ? await (await handle.getFile()).text() : "") + text);
    },
    list: async dir => {
      const handle = await dirAt(root, dir);
      if (!handle) return [];
      const names = [];
      for await (const name of handle.keys()) names.push(name);
      return names.sort();
    },
    makeDir: async dir => { await dirAt(root, dir, true); },
  };
}

/** Asks for read/write access to a stored handle (needs a click or key press). @returns {Promise<boolean>} */
export async function requestAccess(handle) {
  const mode = { mode: "readwrite" };
  if (typeof handle.queryPermission !== "function") return true;    // the browser's own storage (OPFS) needs no prompt
  return (await handle.queryPermission(mode)) === "granted" || (await handle.requestPermission(mode)) === "granted";
}
