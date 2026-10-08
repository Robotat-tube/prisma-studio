// Library sync (`included_in`, `candidate_in`) gives the same changes and note texts as Python, on copies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pythonReference, skipWithoutReview } from "./helpers.js";
import { nodeFolder } from "../../src/adapters/node-folder.js";
import { ReviewRepository } from "../../src/services/review-repository.js";
import { applyLibrarySync, openLibrary, planLibrarySync } from "../../src/services/library.js";

const WORK = join(tmpdir(), "prisma-studio-parity");

test("library sync plans and writes the same changes as Python", { skip: skipWithoutReview, timeout: 600_000 }, async () => {
  const { review, printed } = pythonReference("sync_ref.py", WORK);
  const base = join(WORK, "sync");
  const clock = { today: () => "2026-01-15", now: () => "2026-01-15 00:00" };
  const repo = await ReviewRepository.open(nodeFolder(join(base, "review", review)), clock,
    { name: review.replace(/ records$/, ""), recordsPath: "" });
  const library = await openLibrary(nodeFolder(join(base, "js-vault", "98 - Publications")));
  const plan = planLibrarySync(repo, library);

  // the change list Python printed, then the included records without a publication note
  const pyLines = printed.split("\n");
  const changeLines = plan.changes.map(c => `${c.note}: ${c.add ? "add to" : "remove from"} ${c.key}`);
  assert.deepEqual(changeLines, pyLines.slice(0, changeLines.length), "change list");
  for (const l of plan.lacking) assert.ok(pyLines.includes(`  ${l}`), `lacking: ${l}`);
  assert.ok(plan.changes.length + plan.lacking.length > 0, "the comparison has something to compare");

  await applyLibrarySync(library, repo, plan);
  const [py, js] = ["py-vault", "js-vault"].map(v => join(base, v, "98 - Publications"));
  const differ = [];
  for (const f of await readdir(py)) {
    const [a, b] = await Promise.all([readFile(join(py, f), "utf8"), readFile(join(js, f), "utf8")]);
    if (a.replace(/\r\n?/g, "\n") !== b.replace(/\r\n?/g, "\n")) differ.push(f);
  }
  assert.deepEqual(differ, [], "library notes differ after sync");
});
