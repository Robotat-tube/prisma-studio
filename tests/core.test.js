// Compares engine/core.js with the Python engine on a real review folder.
//   PRISMA_PY=<folder with prisma_review.py>  REVIEW_DIR=<"… records" folder>  npm test
// Skipped when the folders are not set (the review data is private and never part of this repo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as core from "../engine/core.js";

const PY = process.env.PRISMA_PY, REVIEW = process.env.REVIEW_DIR;
const skip = !PY || !REVIEW ? "set PRISMA_PY and REVIEW_DIR to compare with the Python engine" : false;

let ref;
const reference = () => {
  if (ref) return ref;
  const r = spawnSync("python", [join(import.meta.dirname, "ref", "core_ref.py"), PY, REVIEW],
    { encoding: "utf8", maxBuffer: 1 << 30, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  if (r.status !== 0) throw new Error(r.stderr);
  return (ref = JSON.parse(r.stdout));
};

// Report every difference at once, not only the first
function same(label, pairs) {
  const bad = pairs.filter(([, a, b]) => JSON.stringify(a) !== JSON.stringify(b));
  assert.equal(bad.length, 0, `${label}: ${bad.length} of ${pairs.length} differ, e.g.\n` +
    bad.slice(0, 3).map(([k, a, b]) => `  ${k}\n    js: ${JSON.stringify(a)?.slice(0, 300)}\n    py: ${JSON.stringify(b)?.slice(0, 300)}`).join("\n"));
}

test("front matter, names and normalisation match Python on every record", { skip }, () => {
  const { records } = reference();
  const rows = records.map(r => {
    const text = core.readText(readFileSync(join(REVIEW, "08 - Records", r.file), "utf8"));
    const [fm, body] = core.readFm(text);
    return { r, fm, body, text };
  });
  same("readFm", rows.map(({ r, fm }) => [r.file, fm, r.fm]));
  same("body", rows.map(({ r, body }) => [r.file, [...body].length, r.body_len]));
  same("dumpFm", rows.map(({ r, fm }) => [r.file, core.dumpFm(fm), r.dump]));
  same("recordName", rows.map(({ r, fm }) => [r.file, core.recordName(fm.record_id ?? "", fm.authors, fm.year, fm.title), r.name]));
  same("citedAuthors", rows.map(({ r, fm }) => [r.file, core.citedAuthors(fm.authors), r.cited]));
  same("normTitle", rows.map(({ r, fm }) => [r.file, core.normTitle(fm.title), r.norm_title]));
  same("normDoi", rows.map(({ r, fm }) => [r.file, core.normDoi(fm.doi), r.norm_doi]));
  same("yearOf", rows.map(({ r, fm }) => [r.file, core.yearOf(fm.year), r.year]));
  same("setListKey", rows.map(({ r, text }) => [r.file, core.setListKey(text, "sources", ["A", "B, c"]).slice(0, 2000), r.set_list]));
});

test("duplicate index and title similarity match Python", { skip }, () => {
  const { records, index, ratios } = reference();
  const idx = new core.Index();
  for (const { fm } of records) idx.add(fm.record_id, fm.doi, fm.title, core.yearOf(fm.year));
  same("Index.find", records.map(({ file, fm }) => [file, idx.find("", String(fm.title ?? "") + " x", core.yearOf(fm.year)), index[file]]));
  same("ratio", ratios.map(([a, b, r]) => [a, Math.round(core.ratio(a, b) * 1e9), Math.round(r * 1e9)]));
});

test("import parsers match Python on the review's export files", { skip }, () => {
  const { exports } = reference();
  const names = Object.keys(exports);
  assert.ok(names.length, "no export files found to compare");
  for (const name of names) {
    const text = core.readText(readFileSync(join(REVIEW, "07 - Exports", name), "utf8"));
    const js = core.parseFile(name, text);
    same(`parseFile ${name} count`, [[name, js.length, exports[name].length]]);
    same(`parseFile ${name}`, js.map((e, i) => [`${name} #${i}`, e, exports[name][i]]));
  }
});

test("front matter round trip without the Python engine", () => {
  const text = '---\ntype: review-record\nyear: 2024\nflag: true\nsources:\n  - "Scopus"\n  - WoS\ntags: [a, "b, c"]\nempty: \n---\n# Body\n';
  const [fm, body] = core.readFm(text);
  assert.deepEqual(fm, { type: "review-record", year: 2024, flag: true, sources: ["Scopus", "WoS"], tags: ["a", "b, c"], empty: "" });
  assert.equal(body, "# Body\n");
  assert.equal(core.dumpFm({ a: "x", n: 3, l: [], b: false }), '---\na: "x"\nn: 3\nl: []\nb: false\n---\n');
  assert.equal(core.recordName("R0001", "Liu, Z.; Zhong, P.; Liu, H.", 2024, "Module partition: a/b?"), "R0001 - 2024 - Liu et al. - Module partition ab");
});
