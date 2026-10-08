// Comparing a review folder written by Python with one written by JavaScript.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { sameValue } from "../../src/domain/stages.js";

/** How the Python tool names itself in the notes it generates. */
export const PYTHON_GENERATOR = {
  path: "95 - Tools/PRISMA review/prisma_review.py", rerun: "`prisma_review.py report`",
  commands: "See the header of `95 - Tools/PRISMA review/prisma_review.py`. After a screening session run `report` to refresh [[14 - PRISMA flow]].",
  logBy: "`prisma_review.py`", stagesBy: "95 - Tools/PRISMA review/review_stages.py",
};

async function walk(dir, base = dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p, base));
    else out.push(p.slice(base.length + 1).replaceAll("\\", "/"));
  }
  return out.sort();
}

/** Same files with the same content; review_state.json compared as data, the lock hash checked on each side. */
export async function compareFolders(pyDir, jsDir) {
  const [py, js] = [await walk(pyDir), await walk(jsDir)];
  assert.deepEqual(js.filter(f => !py.includes(f)), [], `files only the JavaScript engine wrote in ${jsDir}`);
  assert.deepEqual(py.filter(f => !js.includes(f)), [], `files only the Python engine wrote in ${pyDir}`);
  const differ = [];
  for (const f of py) {
    const [a, b] = await Promise.all([readFile(join(pyDir, f)), readFile(join(jsDir, f))]);
    if (a.equals(b)) continue;
    const [x, y] = [a, b].map(buf => buf.toString("utf8").replace(/\r\n?/g, "\n"));
    if (x === y) continue;
    if (f.endsWith("review_state.json")) {
      const [sx, sy] = [JSON.parse(x), JSON.parse(y)];
      for (const [s, dir] of [[sx, pyDir], [sy, jsDir]]) {
        if (s.protocol?.file) assert.equal(s.protocol.sha256, createHash("sha256").update(await readFile(join(dir, s.protocol.file))).digest("hex"), `lock hash on ${dir}`);
      }
      delete sx.protocol.sha256; delete sy.protocol.sha256;     // Python on Windows hashes the file with CRLF line ends
      if (sameValue(sx, sy)) continue;
      const k = Object.keys(sx).find(key => !sameValue(sx[key], sy[key]));
      differ.push(`${f}: "${k}"\n    py: ${JSON.stringify(sx[k])?.slice(0, 400)}\n    js: ${JSON.stringify(sy[k])?.slice(0, 400)}`);
      continue;
    }
    const xl = x.split("\n"), yl = y.split("\n");
    const i = xl.findIndex((l, n) => l !== yl[n]);
    differ.push(`${f}\n    line ${i + 1}\n    py: ${JSON.stringify(xl[i])?.slice(0, 300)}\n    js: ${JSON.stringify(yl[i])?.slice(0, 300)}`);
  }
  assert.equal(differ.length, 0, `${differ.length} of ${py.length} files differ:\n` + differ.slice(0, 8).join("\n"));
}

