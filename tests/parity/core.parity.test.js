// Parity with the Python engine on a real review folder (the data never enters this repo):
//   PRISMA_PY=<folder with prisma_review.py>  REVIEW_DIR=<"… records" folder>  npm run test:parity
import { test } from "node:test";
import assert from "node:assert/strict";
import { pythonReference, sameEverywhere, skipWithoutReview, REVIEW } from "./helpers.js";
import { nodeFolder } from "../../src/adapters/node-folder.js";
import * as fm from "../../src/domain/frontmatter.js";
import { citedAuthors, recordName } from "../../src/domain/names.js";
import { DuplicateIndex, normalizeDoi, normalizeTitle, yearOf } from "../../src/domain/matching.js";
import { similarity } from "../../src/domain/similarity.js";
import { parseExport } from "../../src/domain/importers.js";
import { pyLen } from "../../src/domain/pytext.js";

const ref = () => pythonReference("core_ref.py");

test("front matter, names and normalisation match Python on every record", { skip: skipWithoutReview }, async () => {
  const folder = nodeFolder(REVIEW);
  const rows = await Promise.all(ref().records.map(async r => {
    const text = await folder.readText(`08 - Records/${r.file}`);
    const [props, body] = fm.parse(text);
    return { r, props, body, text };
  }));
  sameEverywhere("parse", rows.map(({ r, props }) => [r.file, props, r.fm]));
  sameEverywhere("body", rows.map(({ r, body }) => [r.file, pyLen(body), r.body_len]));
  sameEverywhere("serialize", rows.map(({ r, props }) => [r.file, fm.serialize(props), r.dump]));
  sameEverywhere("recordName", rows.map(({ r, props: p }) => [r.file, recordName(p.record_id ?? "", p.authors, p.year, p.title), r.name]));
  sameEverywhere("citedAuthors", rows.map(({ r, props: p }) => [r.file, citedAuthors(p.authors), r.cited]));
  sameEverywhere("normalizeTitle", rows.map(({ r, props: p }) => [r.file, normalizeTitle(p.title), r.norm_title]));
  sameEverywhere("normalizeDoi", rows.map(({ r, props: p }) => [r.file, normalizeDoi(p.doi), r.norm_doi]));
  sameEverywhere("yearOf", rows.map(({ r, props: p }) => [r.file, yearOf(p.year), r.year]));
  sameEverywhere("replaceList", rows.map(({ r, text }) => [r.file, fm.replaceList(text, "sources", ["A", "B, c"]).slice(0, 2000), r.set_list]));
});

test("duplicate index and title similarity match Python", { skip: skipWithoutReview }, () => {
  const { records, index, ratios } = ref();
  const idx = new DuplicateIndex();
  for (const { fm: p } of records) idx.add(p.record_id, p.doi, p.title, yearOf(p.year));
  sameEverywhere("DuplicateIndex.find", records.map(({ file, fm: p }) => [file, idx.find("", String(p.title ?? "") + " x", yearOf(p.year)), index[file]]));
  sameEverywhere("similarity", ratios.map(([a, b, r]) => [a, Math.round(similarity(a, b) * 1e9), Math.round(r * 1e9)]));
});

test("import parsers match Python on the review's export files", { skip: skipWithoutReview }, async () => {
  const { exports } = ref();
  const folder = nodeFolder(REVIEW);
  assert.ok(Object.keys(exports).length, "no export files found to compare");
  for (const [name, expected] of Object.entries(exports)) {
    const entries = parseExport(name, await folder.readText(`07 - Exports/${name}`));
    sameEverywhere(`${name}: count`, [[name, entries.length, expected.length]]);
    sameEverywhere(name, entries.map((e, i) => [`${name} #${i}`, e, expected[i]]));
  }
});
