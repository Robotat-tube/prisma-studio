// ReviewSession on an in-memory review: actions, saving, and amendments once the protocol is locked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { AmendmentRequired, ReviewSession } from "../../src/services/review-session.js";
import { ReviewError } from "../../src/services/review-commands.js";

const deps = () => ({ clock: { today: () => "2026-01-15", now: () => "2026-01-15 10:00" }, settings: { name: "T", recordsPath: "T records/08 - Records" } });
const ris = "TY  - JOUR\nTI  - Module identification in electronic products\nAU  - Liu, Z.\nPY  - 2024\nER  - \n";

test("a new review: concepts, strings, protocol, lock, then amendments", async () => {
  const folder = memoryFolder();
  const s = await ReviewSession.open(folder, deps());
  await s.saveConcepts([{ name: "Modularity", terms: ["modular*", "module"] }, { name: "Products", terms: ["electronic*"] }]);
  assert.match(s.previewQueries(s.st.concepts).Scopus, /^TITLE-ABS-KEY\(\(modular\* OR module\) AND \(electronic\*\)\)$/);
  assert.ok(await folder.exists("review_state.json"));
  assert.ok(await folder.exists("03 - Search strategy.md"));
  await assert.rejects(s.importSearch({ fileName: "a.ris", bytes: new TextEncoder().encode(ris), database: "Scopus", query: "q" }), ReviewError, "import waits for the lock");
  await s.saveProtocolText({ ...s.st.protocol_text, rationale: "Why." }, { generate: true });
  assert.ok(await folder.exists("05 - Protocol.md"));
  await s.lockProtocol("OSF-1");
  assert.ok(await folder.exists("06 - Protocol (registered 2026-01-15).md"));
  assert.match(s.st.protocol.sha256, /^[0-9a-f]{64}$/);
  await assert.rejects(s.saveConcepts([{ name: "Other", terms: ["x"] }]), AmendmentRequired);
  await s.saveConcepts([{ name: "Other", terms: ["x"] }], "", "pilot showed noise");
  assert.equal(s.st.amendments.at(-1).what, "concepts");
  assert.equal(s.st.concepts_history.length, 1);
  assert.deepEqual(await s.integrityProblems(), []);
  await folder.writeText(s.st.protocol.file, "edited after locking");
  assert.match((await s.integrityProblems())[0], /was edited after locking/);
  const msg = await s.importSearch({ fileName: "a.ris", bytes: new TextEncoder().encode(ris), database: "Scopus", query: "q" });
  assert.match(msg, /1 new/);
  const [r] = s.records();
  await s.decide(r.id, "ta", "include");
  assert.equal(s.repo.records.get(r.id).props.ft_decision, "pending", "include opens the full-text stage");
  assert.equal(s.st.stages.screening.status, "in-progress");
});

test("developer mode lifts the locks but logs every change", async () => {
  const s = await ReviewSession.open(memoryFolder(), deps());
  s.st.protocol.locked = "2026-01-01";
  await s.setDevMode(true);
  await s.saveDatabases(["Scopus"]);
  assert.match(s.st.events.at(-2).text, /developer mode: queries changed without an amendment/);
  await s.setDevMode(false);
  await assert.rejects(s.saveDatabases(["OpenAlex"]), AmendmentRequired);
});
