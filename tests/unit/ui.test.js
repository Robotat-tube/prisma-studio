// The browser shell's logic without a browser: the page snapshot and the backend's routing of actions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { ReviewSession } from "../../src/services/review-session.js";
import { snapshot } from "../../src/ui/view-model.js";
import { Backend } from "../../src/ui/backend.js";

const clock = { today: () => "2026-01-15", now: () => "2026-01-15 10:00" };
const ris = ["Module identification in electronics", "Design structure matrix for products"]
  .map((t, i) => `TY  - JOUR\nTI  - ${t}\nAU  - Liu, Z.\nPY  - 202${i}\nER  - `).join("\n") + "\n";

async function backendWithReview() {
  const session = await ReviewSession.open(memoryFolder({}, "Demo records"), { clock, settings: { name: "Demo", recordsPath: "Demo records/08 - Records" } });
  const backend = new Backend({ help: {}, templates: { record: "", publication: "" }, pdfjs: {} });
  backend.session = session;
  backend.entry = { name: "Demo records", settings: {} };
  backend.reviewNames = async () => ["Demo records"];
  return backend;
}

test("snapshot has everything the page reads", async () => {
  const backend = await backendWithReview();
  const s = await snapshot(backend.session, { review: "Demo records", reviews: [], vault: "" });
  for (const key of ["stages", "state", "events", "queries", "searches", "flow", "agreement", "problems", "reasons", "test_set", "records",
    "rounds", "charting_progress", "ai", "library", "lock_checks", "checklist_auto", "checklist_items", "protocol_sections", "sheets"]) {
    assert.ok(key in s, `snapshot.${key}`);
  }
  assert.equal(s.stages.length, 15);
  assert.equal(s.checklist_items.length, 22);
  assert.deepEqual(Object.keys(s.ai.modes), ["screening", "reviewer", "retrieval", "charting"]);
});

test("backend: import, decide, preview, amendment answer, errors", async () => {
  const backend = await backendWithReview();
  const token = backend.upload({ name: "s.ris", arrayBuffer: async () => new TextEncoder().encode(ris).buffer });
  const refused = await backend.action("import", { path: token, database: "Scopus", query: "q" });
  assert.equal(refused.status, 400, "imports wait for the locked protocol");
  const imported = await backend.action("import", { path: token, database: "Scopus", query: "q", force: true });
  assert.equal(imported.status, 200);
  assert.equal(imported.body.state.records.length, 2);
  const decided = await backend.action("decide", { record_id: "R0001", stage: "ta", decision: "include" });
  assert.equal(decided.body.state.flow.ft_pending, 1);
  const preview = await backend.action("preview_queries", { concepts: [{ name: "M", terms: ["modular*"] }] });
  assert.equal(preview.body.queries.Scopus, "TITLE-ABS-KEY((modular*))");
  assert.ok(!("state" in preview.body), "previews do not send the whole state");
  await backend.action("lock_protocol", {});
  const locked = await backend.action("save_databases", { databases: ["Scopus"] });
  assert.deepEqual([locked.status, locked.body], [409, { amendment: "list of databases" }]);
  const abstract = await backend.action("record_abstract", { record_id: "R0002" });
  assert.equal(abstract.body.record.record_id, "R0002");
  const unknown = await backend.action("nope", {});
  assert.equal(unknown.status, 400);
  assert.equal((await backend.get("/api/reviews")).reviews[0], "Demo records");
});

test("snapshot after an action shows the changed record (views and checks are kept per record)", async () => {
  const backend = await backendWithReview();
  const token = backend.upload({ name: "s.ris", arrayBuffer: async () => new TextEncoder().encode(ris).buffer });
  await backend.action("import", { path: token, database: "Scopus", query: "q", force: true });
  const before = await backend.snapshot();
  const after = (await backend.action("decide", { record_id: "R0002", stage: "ta", decision: "exclude", reason: "E9" })).body.state;
  const r1 = id => s => s.records.find(r => r.record_id === id);
  assert.equal(r1("R0002")(before).ta_decision, "pending");
  assert.equal(r1("R0002")(after).ta_decision, "exclude");
  assert.equal(r1("R0001")(after), r1("R0001")(before), "an unchanged record keeps its view");
  assert.ok(after.problems.some(p => p.record_id === "R0002"), "a reason not in the guide is a problem");
  const again = (await backend.action("decide", { record_id: "R0002", stage: "ta", decision: "pending" })).body.state;
  assert.ok(!again.problems.some(p => p.record_id === "R0002"), "the problem goes once the record changes");
});

test("backend: re-reads the review after changes made outside the app, and never saves over them", async () => {
  const backend = await backendWithReview();
  await backend.action("save_databases", { databases: ["Scopus"] });              // the app's own write
  assert.equal(await backend.refreshIfChanged(), false, "its own writes are not outside changes");
  const folder = backend.session.repo.folder;
  const outside = async text => {
    const st = JSON.parse(await folder.readText("review_state.json"));
    st.events.push({ when: "2026-01-15 11:00", stage: "screening", text });
    await folder.writeText("review_state.json", JSON.stringify(st));
  };
  await outside("written by Claude");
  assert.equal(await backend.refreshIfChanged(), true);
  assert.equal(backend.session.st.events.at(-1).text, "written by Claude");
  assert.equal(await backend.refreshIfChanged(), false);
  await outside("written by Claude again");
  await backend.action("save_databases", { databases: ["Scopus", "OpenAlex"] });
  const saved = JSON.parse(await folder.readText("review_state.json"));
  assert.ok(saved.events.some(e => e.text === "written by Claude again"), "an action first takes in the outside change");
});
