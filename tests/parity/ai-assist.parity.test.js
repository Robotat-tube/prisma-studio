// The AI-assist commands give the AI the same context, refuse and accept the same things, and write the same
// files as the Python tool, on identically prepared copies of a review with every AI mode on.
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pythonReference, sameEverywhere, skipWithoutReview } from "./helpers.js";
import { compareFolders, PYTHON_GENERATOR } from "./folders.js";
import { nodeFolder } from "../../src/adapters/node-folder.js";
import { ReviewRepository } from "../../src/services/review-repository.js";
import { loadState } from "../../src/services/review-state.js";
import { aiAttach, aiChart, aiContext, aiSecondReviewer, aiSuggest } from "../../src/services/ai-assist.js";

const WORK = join(tmpdir(), "prisma-studio-parity");

test("AI-assist commands match the Python tool", { skip: skipWithoutReview, timeout: 900_000 }, async () => {
  const ref = pythonReference("ai_ref.py", WORK);
  const base = join(WORK, "ai"), inputs = join(base, "inputs"), dir = join(base, "js", ref.review);
  const clock = { today: () => ref.today, now: () => ref.now };
  const json = async name => JSON.parse(await readFile(join(inputs, name), "utf8"));
  // a fresh repository and state per command, as the Python command line starts afresh each time
  const open = async () => {
    const repo = await ReviewRepository.open(nodeFolder(dir), clock, { name: ref.review.replace(/ records$/, ""), recordsPath: "", generator: PYTHON_GENERATOR });
    return [repo, await loadState(repo.folder)];
  };
  // paths as Python shows them: relative to the folder that holds the review (its "vault")
  const rel = p => (p ? `${ref.review}/${p}` : ref.review);
  const ctx = async (step, limit) => { const [repo, st] = await open(); return JSON.stringify(await aiContext(repo, st, step, { limit, rel }), null, 1) + "\n"; };
  const lines = (msg, skipped = []) => [msg, ...skipped.map(s => "  skipped " + s)].join("\n") + "\n";
  const out = {};
  out["context screening"] = await ctx("screening", 2);
  { const [repo, st] = await open(); const r = await aiSuggest(repo, st, await json("suggest_ta.json"), { model: "parity-model", stage: "ta" }); out["suggest ta"] = lines(r.message, r.skipped); }
  out["context retrieval"] = await ctx("retrieval", 3);
  { const [repo, st] = await open(); out.attach = (await aiAttach(repo, st, ref.attach, new Uint8Array(await readFile(join(inputs, "paper.pdf"))), { model: "parity-model" })) + "\n"; }
  out["context fulltext"] = await ctx("fulltext", 2);
  { const [repo, st] = await open(); const r = await aiSuggest(repo, st, await json("suggest_ft.json"), { model: "parity-model", stage: "ft" }); out["suggest ft"] = lines(r.message, r.skipped); }
  out["context reviewer"] = await ctx("reviewer", 40);
  { const [repo, st] = await open(); await aiSecondReviewer(repo, st, await json("r2.json"), { model: "parity-model" }); }
  out["context charting"] = await ctx("charting", 2);
  { const [repo, st] = await open(); const l = await aiChart(repo, st, await json("chart.json"), { model: "parity-model" }); out.chart = l.length ? l.join("\n") + "\n" : ""; }

  const pyFolder = join(WORK, "ai", "py", ref.review);
  sameEverywhere("command output", Object.keys(out).map(k => [k, out[k], ref.outputs[k]]));
  await compareFolders(pyFolder, dir);
});
