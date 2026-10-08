// Rules and use cases of the records module, on an in-memory review folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cohensKappa } from "../../src/domain/agreement.js";
import { flowCounts } from "../../src/domain/flow.js";
import { sample } from "../../src/domain/pyrandom.js";
import { formatFixed, formatPercent } from "../../src/domain/pytext.js";
import { createRecord, mergeDuplicate, nextRecordId } from "../../src/domain/records.js";
import { checkRecord, isValidReason } from "../../src/domain/screening.js";
import { makeEntry } from "../../src/domain/importers.js";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { ReviewRepository } from "../../src/services/review-repository.js";
import * as commands from "../../src/services/review-commands.js";

const clock = { today: () => "2026-01-15", now: () => "2026-01-15 10:00" };
const settings = { name: "Test review", recordsPath: "Test review records/08 - Records" };
const entry = (title, more = {}) => makeEntry({ title, authors: "Liu, Z.", year: "2024", ...more });

test("random sample is Python's random.Random(seed).sample", () => {
  // values printed by Python 3: random.Random(42).sample(range(39), 8) and random.Random(7).sample(range(30), 6)
  assert.deepEqual(sample(42, [...Array(39).keys()], 8), [7, 1, 17, 15, 14, 8, 6, 5]);
  assert.deepEqual(sample(7, [...Array(30).keys()], 6), [10, 4, 12, 20, 1, 2]);
  assert.equal(new Set(sample(1, [...Array(5683).keys()], 285)).size, 285);
  assert.throws(() => sample(1, [1, 2], 3), RangeError);
});

test("number formatting rounds like Python", () => {
  assert.equal(formatFixed(0.125, 2), "0.12");
  assert.equal(formatFixed(0.375, 2), "0.38");
  assert.equal(formatFixed(2.5, 0), "2");
  assert.equal(formatFixed(-0, 2), "-0.00");
  assert.equal(formatPercent(0.05), "5%");
});

test("records: ids, creation from the template, merging duplicates", () => {
  assert.equal(nextRecordId(new Set()), "R0001");
  assert.equal(nextRecordId(new Set(["R0001", "R0003"])), "R0004");
  const template = "---\ntype: \"\"\ncustom: x\n---\n\n# {{title}}\n\n## Abstract\n\n{{abstract}}\n\n## Keywords\n\n{{keywords}}\n";
  const r = createRecord({ id: "R0001", entry: entry("Module $& partition", { doi: "10.1/x", keywords: "k" }), reviewLink: "[[T]]", sourceId: "S01", publication: "001 - Paper", template });
  assert.deepEqual(Object.keys(r.props).slice(0, 3), ["type", "custom", "review"]);
  assert.equal(r.props.url, "https://doi.org/10.1/x");
  assert.equal(r.props.publication, "[[001 - Paper]]");
  assert.match(r.body, /# Module \$& partition/);
  assert.match(r.body, /_\(no abstract in the export\)_/);
  assert.equal(r.file, "08 - Records/R0001 - 2024 - Liu - Module $& partition.md");
  const m = mergeDuplicate(r, entry("Module partition", { abstract: "Now with abstract", journal: "J" }), "S02");
  assert.deepEqual(m.props.sources, ["S01", "S02"]);
  assert.equal(m.props.journal, "J");
  assert.match(m.body, /Now with abstract/);
  assert.deepEqual(r.props.sources, ["S01"], "merge does not change its input");
});

test("screening check: normalises, fills the full-text stage and the date, reports problems", () => {
  const reasons = { ta: ["E1 wrong concept"], ft: ["E1 wrong concept", "E6 no content"] };
  const a = checkRecord({ ta_decision: " Include ", ft_decision: "" }, reasons, "2026-01-15");
  assert.equal(a.props.ta_decision, "include");
  assert.equal(a.props.ft_decision, "pending");
  assert.equal(a.props.screened_on, "2026-01-15");
  assert.equal(a.changed, true);
  const b = checkRecord({ ta_decision: "exclude", ta_reason: "E9", ft_decision: "pending", screened_on: "x" }, reasons, "d");
  assert.equal(b.props.ft_decision, "");
  assert.deepEqual(b.problems, ["excluded at title/abstract without a reason from the Screening guide"]);
  assert.equal(isValidReason("E1", reasons.ta), true);
  assert.equal(isValidReason("", reasons.ta), false);
  assert.equal(checkRecord({ ta_decision: "pending", ft_decision: "" }, reasons, "d").changed, false);
});

test("Cohen's kappa and flow counts", () => {
  assert.deepEqual(cohensKappa([]), [null, null]);
  assert.deepEqual(cohensKappa([["include", "include"], ["exclude", "exclude"]]), [1, 1]);
  const [po, k] = cohensKappa([["include", "include"], ["include", "exclude"], ["exclude", "exclude"], ["exclude", "exclude"]]);
  assert.equal(po, 0.75);
  assert.equal(formatFixed(k, 2), "0.50");
  const counts = flowCounts(
    [{ ta_decision: "include", ft_decision: "include" }, { ta_decision: "exclude", ta_reason: "E1" }, { ta_decision: "unsure", ft_decision: "pending", pdf_status: "not-retrieved" }],
    [{ kind: "database", records: "4" }, { kind: "other", records: "1" }]);
  assert.deepEqual([counts.unique, counts.duplicates, counts.sought, counts.notRetrieved, counts.included, counts.ftPending], [3, 2, 2, 1, 1, 0]);
  assert.deepEqual(counts.taReasons, [["E1", 1]]);
});

test("use cases on an in-memory review: import, check, sample, second reviewer, report", async () => {
  const folder = memoryFolder();
  const open = () => ReviewRepository.open(folder, clock, settings);
  const ris = ["A method for module identification in printed circuit boards", "Product architecture and modularity in consumer electronics", "Design structure matrices for electronic products"]
    .map((t, i) => `TY  - JOUR\nTI  - ${t}\nAU  - Liu, Z.\nPY  - 202${i}\nDO  - 10.1/${i}\nER  - `).join("\n") + "\n";
  const msg = await commands.importSearch(await open(), { fileName: "s.ris", bytes: new TextEncoder().encode(ris), database: "Scopus", query: "q" });
  assert.match(msg, /S01 Scopus: 3 records -> 3 new, 0 duplicates/);
  assert.ok(await folder.exists("07 - Exports/S01 - s.ris"));
  assert.ok(await folder.exists("08 - Screening guide.md"));
  assert.ok(await folder.exists("14 - PRISMA flow.md"));

  const again = await commands.importSearch(await open(), { fileName: "w.ris", bytes: new TextEncoder().encode(ris), database: "WoS", query: "q" });
  assert.match(again, /3 records -> 0 new, 3 duplicates/);
  const repo = await open();
  assert.deepEqual([...repo.records.values()].map(r => r.props.sources), [["S01", "S02"], ["S01", "S02"], ["S01", "S02"]]);

  const drawn = await commands.drawSample(await open(), { stage: "ta", fraction: 0.5, seed: 1 });
  assert.equal(drawn.drawn, 2);
  await assert.rejects(commands.drawSample(await open(), { stage: "ta", seed: 2 }), commands.ReviewError);
  const sheet = await folder.readText(drawn.sheet);
  assert.ok(sheet.startsWith("﻿record_id,title"));
  assert.ok(!/ta_decision|pending/.test(sheet), "the blind sheet has no first-reviewer decisions");

  const filled = sheet.split("\r\n").map((l, i) => (i && l ? l.replace(/,,$/, ",include,") : l)).join("\r\n");
  const r2 = await commands.importSecondReviewer(await open(), { fileName: "f.csv", text: filled, stage: "ta" });
  assert.match(r2, /^2 decisions imported/);
  const flow = await folder.readText("14 - PRISMA flow.md");
  assert.match(flow, /\| Records identified — databases \| 6 \|/);
  assert.match(flow, /\| Duplicates removed \| 3 \|/);
  assert.match(flow, /\| Title\/abstract \| 2 \| 0 \|/, "no pairs while the reviewer has not decided");
  assert.match(await folder.readText("00 - Review log.md"), /\| 2026-01-15 \| import-r2 \| ta: 2 second-reviewer decisions from f.csv \|/);
});
