// The AI assistant's commands (bin/ai-assist.js, used by the review skills) on an in-memory review:
// each refuses when the review switched the AI off, writes suggestions but never the reviewer's decisions,
// and logs the model in the timeline.
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { ReviewSession } from "../../src/services/review-session.js";
import { aiAttach, aiChart, aiContext, AiNotAllowed, aiSecondReviewer, aiSuggest } from "../../src/services/ai-assist.js";
import { ReviewError } from "../../src/services/review-commands.js";

const deps = () => ({ clock: { today: () => "2026-01-15", now: () => "2026-01-15 10:00" }, settings: { name: "T", recordsPath: "T records/08 - Records" } });
const ris = ["Module identification in electronic products", "Microservice decomposition", "DSM clustering of a printer", "Design structure matrix review"]
  .map((t, i) => `TY  - JOUR\nTI  - ${t}\nAU  - Liu, Z.\nPY  - 202${i}\nAB  - Abstract of ${t}.\nER  - `).join("\n") + "\n";
const model = "claude-test";

/** A locked review with four imported records, all pending. */
async function review() {
  const s = await ReviewSession.open(memoryFolder(), deps());
  await s.lockProtocol("OSF-1");
  await s.importSearch({ fileName: "a.ris", bytes: new TextEncoder().encode(ris), database: "Scopus", query: "q" });
  return s;
}
const props = (s, id) => s.repo.records.get(id).props;

test("every command refuses while the AI is off for its step", async () => {
  const s = await review();
  for (const step of ["screening", "fulltext", "reviewer", "retrieval", "charting"]) {
    await assert.rejects(aiContext(s.repo, s.st, step), AiNotAllowed, step);
  }
  await assert.rejects(aiSuggest(s.repo, s.st, [], { model }), AiNotAllowed);
  await assert.rejects(aiChart(s.repo, s.st, [], { model }), AiNotAllowed);
  await assert.rejects(aiAttach(s.repo, s.st, "R0001", new Uint8Array(), { model }), AiNotAllowed);
});

test("screening: context lists pending records; suggestions never become decisions", async () => {
  const s = await review();
  s.st.ai = { screening: "suggest" };
  const ctx = await aiContext(s.repo, s.st, "screening", { limit: 2 });
  assert.equal(ctx.remaining, 4);
  assert.equal(ctx.records.length, 2);
  assert.match(ctx.records[0].abstract, /^Abstract of /);
  await s.decide("R0004", "ta", "include");                       // the reviewer already decided this one
  const reason = ctx.ta_reasons[0].split(" ")[0];
  const { written, skipped } = await aiSuggest(s.repo, s.st, [
    { id: "R0001", decision: "include", why: "Module identification." },
    { id: "R0002", decision: "exclude", reason, why: "Software only." },
    { id: "R0003", decision: "exclude", reason: "E99", why: "?" },
    { id: "R0004", decision: "exclude", reason },
    { id: "R9999", decision: "include" },
    { id: "R0003", decision: "maybe" },
  ], { model });
  assert.equal(written, 2);
  assert.deepEqual(skipped.map(t => t.split(":")[0]), ["R0003", "R0004", "R9999", "R0003"]);
  assert.equal(props(s, "R0001").ai_decision, "include");
  assert.equal(props(s, "R0001").ta_decision, "pending", "the decision stays the reviewer's");
  assert.deepEqual([props(s, "R0002").ai_decision, props(s, "R0002").ai_reason], ["exclude", reason]);
  assert.equal(props(s, "R0004").ai_decision, undefined);
  assert.match(s.st.events.at(-1).text, /AI \(claude-test\) suggested title\/abstract decisions for 2 record/);
  assert.equal((await aiContext(s.repo, s.st, "screening")).remaining, 1, "suggested records leave the AI's queue");
});

test("full text: only records with an attached PDF, and only from the PDF", async () => {
  const s = await review();
  s.st.ai = { screening: "suggest-ft", retrieval: "assist" };
  await s.decide("R0001", "ta", "include");
  await s.decide("R0003", "ta", "unsure");
  await aiAttach(s.repo, s.st, "R0001", new TextEncoder().encode("%PDF-1.7 test"), { model });
  const ctx = await aiContext(s.repo, s.st, "fulltext");
  assert.deepEqual([ctx.remaining, ctx.without_pdf, ctx.records.map(r => r.id)], [2, 1, ["R0001"]]);
  const { written, skipped } = await aiSuggest(s.repo, s.st, [
    { id: "R0001", decision: "include", why: "p. 3: a DSM of a phone." }, { id: "R0003", decision: "include" }], { model, stage: "ft" });
  assert.equal(written, 1);
  assert.match(skipped[0], /R0003: no full text attached/);
  assert.equal(props(s, "R0001").ai_ft_decision, "include");
  assert.equal(props(s, "R0001").ft_decision, "pending");
});

test("retrieval: attaches PDFs only, notes the model, refuses other files", async () => {
  const s = await review();
  s.st.ai = { retrieval: "assist" };
  await s.decide("R0001", "ta", "include");
  assert.deepEqual((await aiContext(s.repo, s.st, "retrieval")).records.map(r => r.id), ["R0001"]);
  await assert.rejects(aiAttach(s.repo, s.st, "R0001", new TextEncoder().encode("<html>"), { model }), /not a PDF/);
  await assert.rejects(aiAttach(s.repo, s.st, "R0404", new TextEncoder().encode("%PDF-"), { model }), ReviewError);
  assert.match(await aiAttach(s.repo, s.st, "R0001", new TextEncoder().encode("%PDF-1.7"), { model }), /^R0001: attached as R0001 - /);
  assert.equal(props(s, "R0001").pdf_status, "found");
  assert.match(props(s, "R0001").notes, /full text fetched by AI \(claude-test\)/);
  assert.deepEqual((await aiContext(s.repo, s.st, "retrieval")).records, [], "a found PDF leaves the queue");
});

test("charting: fills only empty fields of included records, never after the reviewer checked", async () => {
  const s = await review();
  s.st.ai = { charting: "prefill" };
  for (const id of ["R0001", "R0002"]) { await s.decide(id, "ta", "include"); await s.decide(id, "ft", "include"); }
  const [first, second] = s.st.charting.fields.filter(f => f.name !== "checked_by").map(f => f.name);
  await s.setRecord("R0001", { [`chart_${first}`]: "by hand" });
  await s.setRecord("R0002", { chart_checked_by: "reviewer" });
  const ctx = await aiContext(s.repo, s.st, "charting");
  assert.deepEqual(ctx.records.map(r => r.id), ["R0001"]);
  assert.deepEqual(ctx.records[0].filled, { [first]: "by hand" });
  const lines = await aiChart(s.repo, s.st, [
    { id: "R0001", fields: { [first]: "AI value", [second]: "  p. 4: graph partitioning  ", unknown: "x" } },
    { id: "R0002", fields: { [first]: "x" } }, { id: "R0003", fields: { [first]: "x" } }], { model });
  assert.deepEqual(lines, [`R0001: ${second}`, "  skipped R0002: already checked by the reviewer", "  skipped R0003: not an included record"]);
  assert.equal(props(s, "R0001")[`chart_${first}`], "by hand", "a value already there is kept");
  assert.equal(props(s, "R0001")[`chart_${second}`], "p. 4: graph partitioning");
  assert.equal(props(s, "R0001").chart_checked_by, "AI");
});

test("second reviewer: fills a copy of the blind sheet, imports it and names the model", async () => {
  const s = await review();
  s.st.ai = { reviewer: "ai" };
  await assert.rejects(aiContext(s.repo, s.st, "reviewer"), /no blind sheet/);
  for (const id of ["R0001", "R0002", "R0003", "R0004"]) await s.decide(id, "ta", id === "R0002" ? "exclude" : "include", { reason: "E1" });
  await s.sample({ stage: "ta", fraction: 0.5, seed: 7 });
  const ctx = await aiContext(s.repo, s.st, "reviewer");
  assert.equal(ctx.stage, "ta");
  assert.equal(ctx.records.length, 2);
  const ids = ctx.records.map(r => r.record_id);
  await assert.rejects(aiSecondReviewer(s.repo, s.st, [{ record_id: ids[0], decision: "include" }], { model, library: s.library }), /no valid decision/);
  await aiSecondReviewer(s.repo, s.st, ids.map(id => ({ record_id: id, decision: "include" })), { model, library: s.library });
  for (const id of ids) assert.equal(props(s, id).r2_ta_decision, "include");
  assert.equal(s.st.reviewer_ai.ta.model, model);
  assert.ok((await s.repo.folder.list("09 - Second reviewer")).some(n => n.endsWith("(AI).csv")));
});
