// Fast, self-contained tests of the domain layer (no files).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fm from "../../src/domain/frontmatter.js";
import * as csv from "../../src/domain/csv.js";
import { citedAuthors, recordName } from "../../src/domain/names.js";
import { DuplicateIndex, normalizeDoi, normalizeTitle, yearOf } from "../../src/domain/matching.js";
import { similarity } from "../../src/domain/similarity.js";
import { parseExport } from "../../src/domain/importers.js";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { compareCodePoints } from "../../src/domain/text-rules.js";

test("compareCodePoints: code-point order, also past the BMP", () => {
  const sorted = ["b", "a", "ab", "", "～", "\u{1F600}", "R0010", "R0002"].sort(compareCodePoints);
  assert.deepEqual(sorted, ["", "R0002", "R0010", "a", "ab", "b", "～", "\u{1F600}"]);
  assert.ok(compareCodePoints("x\u{1F600}", "x～") > 0, "a surrogate pair sorts after U+FF5E, unlike UTF-16 order");
  assert.equal(compareCodePoints("same", "same"), 0);
});

test("front matter: parse, serialize, replace one list", () => {
  const text = '---\ntype: review-record\nyear: 2024\nflag: true\nsources:\n  - "Scopus"\n  - WoS\ntags: [a, "b, c"]\nempty: \n---\n# Body\n';
  const [props, body] = fm.parse(text);
  assert.deepEqual(props, { type: "review-record", year: 2024, flag: true, sources: ["Scopus", "WoS"], tags: ["a", "b, c"], empty: "" });
  assert.equal(body, "# Body\n");
  assert.equal(fm.serialize({ a: "x", n: 3, l: [], b: false }), '---\na: "x"\nn: 3\nl: []\nb: false\n---\n');
  assert.equal(fm.replaceList(text, "sources", ["X"]).split("\n").slice(4, 6).join("|"), 'sources:|  - "X"');
  assert.deepEqual(fm.parse("no front matter"), [{}, "no front matter"]);
});

test("names: authors as cited and record names", () => {
  assert.equal(citedAuthors("Liu, Z."), "Liu");
  assert.equal(citedAuthors("Baldwin, C.; Clark, K."), "Baldwin & Clark");
  assert.equal(citedAuthors("Liu, Z.; Zhong, P.; Liu, H."), "Liu et al.");
  assert.equal(citedAuthors("Agus Sudjianto; Kevin Otto"), "Sudjianto & Otto");
  assert.equal(citedAuthors(""), "Anon");
  assert.equal(recordName("R0001", "Liu, Z.; Zhong, P.; Liu, H.", 2024, "Module partition: a/b?"), "R0001 - 2024 - Liu et al. - Module partition ab");
  assert.equal(recordName("R0002", "", "", "x".repeat(80)), "R0002 - n.d. - Anon - " + "x".repeat(70));
});

test("matching: DOIs, titles, years and duplicates", () => {
  assert.equal(normalizeDoi(" https://doi.org/10.1000/ABC. "), "10.1000/abc");
  assert.equal(normalizeTitle("Modularité — a “Test”!"), "modularite a test");
  assert.equal(yearOf("published 2019-05"), 2019);
  assert.equal(yearOf("n.d."), "");
  const idx = new DuplicateIndex();
  idx.add("R1", "10.1/x", "A method for module identification in electronics", 2020);
  assert.equal(idx.find("10.1/X", "", ""), "R1");
  assert.equal(idx.find("", "A method for module identification in electronics", 2021), "R1");
  assert.equal(idx.find("", "A method for module identification in electronic", 2020), "R1");
  assert.equal(idx.find("", "Something else entirely different here", 2020), null);
  assert.equal(similarity("abc", "abc"), 1);
});

test("csv: reading and writing", () => {
  assert.deepEqual(csv.readRows('a,"b, ""c"""\n\n1,2\n'), [["a", 'b, "c"'], ["1", "2"]]);
  assert.deepEqual(csv.readRecords("id,n\nS01,3\n"), [{ id: "S01", n: "3" }]);
  assert.equal(csv.writeRecords(["id", "q"], [{ id: "S01", q: 'a "b", c' }]), 'id,q\r\nS01,"a ""b"", c"\r\n');
});

test("importers: RIS, BibTeX and CSV", () => {
  const ris = "TY  - JOUR\nTI  - Modular design\nAU  - Liu, Z.\nPY  - 2024\nDO  - 10.1/AB\nER  - \n";
  assert.deepEqual(parseExport("x.ris", ris)[0], { title: "Modular design", authors: "Liu, Z.", year: 2024, journal: "", doi: "10.1/ab", url: "", abstract: "", language: "", keywords: "" });
  const bib = "@article{k, title = {A {B} c}, author = {Liu, Z. and Zhong, P.}, year = 2020}";
  assert.equal(parseExport("x.bib", bib)[0].authors, "Liu, Z.; Zhong, P.");
  assert.equal(parseExport("x.csv", "Title,Year\nT,2001\n")[0].year, 2001);
});

test("memory folder adapter behaves like a folder", async () => {
  const f = memoryFolder({ "08 - Records/R0001.md": "x" });
  assert.equal(await f.exists("08 - Records"), true);
  assert.deepEqual(await f.list("08 - Records"), ["R0001.md"]);
  await f.appendText("log.md", "a");
  await f.appendText("log.md", "b");
  assert.equal(await f.readText("log.md"), "ab");
  await assert.rejects(f.readText("missing.md"));
});
