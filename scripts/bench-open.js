// Times opening a review from disk the way the app does: reading the notes, then building the page's snapshot
// (which the app rebuilds after every action). Use a COPY of a review folder.
//   node scripts/bench-open.js "<… records folder>" [rounds]
import { basename } from "node:path";
import { nodeFolder } from "../src/adapters/node-folder.js";
import { emptyLibrary } from "../src/services/library.js";
import { ReviewSession } from "../src/services/review-session.js";
import { snapshot } from "../src/ui/view-model.js";

const [dir, rounds = "3"] = process.argv.slice(2);
if (!dir) { console.error('usage: node scripts/bench-open.js "<… records folder>" [rounds]'); process.exit(1); }
const name = basename(dir).replace(/ records$/, "");
const clock = { today: () => "2026-01-01", now: () => "2026-01-01 00:00" };
const ms = t => `${(performance.now() - t).toFixed(0)} ms`;

for (let i = 1; i <= Number(rounds); i++) {
  let t = performance.now();
  const session = await ReviewSession.open(nodeFolder(dir), {
    clock, library: emptyLibrary(), openalex: null, devMode: false,
    settings: { name, recordsPath: `${name} records/08 - Records`, template: "" },
  });
  const read = ms(t);
  t = performance.now();
  const snap = await snapshot(session, { review: name, reviews: [], vault: "" });
  const snapTime = ms(t);
  t = performance.now();
  await snapshot(session, { review: name, reviews: [], vault: "" });   // as after an action that changed nothing
  console.log(`round ${i}: ${session.repo.records.size} notes · read ${read} · snapshot ${snapTime} (${(JSON.stringify(snap).length / 1e6).toFixed(1)} MB), again ${ms(t)}`);
}
