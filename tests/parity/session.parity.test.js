// Review Studio's actions (review_server.act in Python, ReviewSession in JavaScript) give the same messages and
// the same files on copies of a review and its library.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pythonReference, sameEverywhere, skipWithoutReview } from "./helpers.js";
import { compareFolders, PYTHON_GENERATOR } from "./folders.js";
import { nodeFolder } from "../../src/adapters/node-folder.js";
import { openLibrary } from "../../src/services/library.js";
import { ReviewSession } from "../../src/services/review-session.js";

const WORK = join(tmpdir(), "prisma-studio-parity");
const crlf = t => t.replace(/\r\n?/g, "\n");

/** The JavaScript call for each Python action; returns the message the UI would show. */
const CALLS = {
  ai_mode: (s, a) => s.setAiMode(a.stage, a.mode, a.amendment),
  stage_status: (s, a) => s.setStageStatus(a.stage, a.status, a.reason),
  add_idea: (s, a) => s.addIdea(a.text),
  save_questions: (s, a) => s.saveQuestions(a.q, a.why, a.amendment),
  save_concepts: (s, a) => s.saveConcepts(a.concepts, a.why, a.amendment),
  save_databases: (s, a) => s.saveDatabases(a.databases, a.amendment),
  save_manual_query: (s, a) => s.saveManualQuery(a.db, a.text, a.amendment),
  pilot_manual: (s, a) => s.pilotManual(a),
  save_protocol_text: (s, a) => s.saveProtocolText(a.text, { author: a.author, generate: a.generate, amendment: a.amendment }),
  approve_section: (s, a) => s.approveSection(a.key),
  supervisor_review: (s, a) => s.supervisorReview(a.by, a.when),
  save_reasons: (s, a) => s.saveReasons(a.ta, a.ft, a.amendment),
  set_test_set: (s, a) => s.setTestSet(a.stems),
  decide: (s, a) => s.decide(a.record_id, a.stage, a.decision, { reason: a.reason ?? "", notes: a.notes }),
  apply_decisions: (s, a) => s.applyDecisions(a.items, a.stage),
  bulk_decide: (s, a) => s.bulkDecide(a.ids, a.reason),
  clear_presort: (s, a) => s.clearPresort(a.ids),
  set_record: (s, a) => s.setRecord(a.record_id, a.fields),
  save_fields: (s, a) => s.saveFields(a.fields, a.amendment),
  appraisal_tool: (s, a) => s.setAppraisalTool(a.tool),
  checklist: (s, a) => s.setChecklistItem(a.n, a.location, a.done),
  write_checklist: s => s.writeChecklist(),
  export: async (s, a) => (await s.export(a.kind)).message,
  sample: (s, a) => s.sample({ stage: a.stage, fraction: a.fraction, seed: Number(a.seed), redo: a.redo }),
  add_paper: (s, a) => s.addPaper(a),
  check: s => s.check(),
  report: s => s.report(),
  prepare_charting: (s, a) => s.prepareCharting(a.appraisal),
  sync: (s, a) => s.sync(a.apply),
  add_to_library: async (s, _a, vault) => s.addToLibrary(crlf(await readFile(join(vault, "99 - Templates", "Publication Template.md"), "utf8"))),
  import: async (s, a) => s.importSearch({ fileName: a.path.split(/[\\/]/).pop(), bytes: new Uint8Array(await readFile(a.path)), database: a.database, query: a.query, date: a.date, filters: a.filters, other: a.other }),
};
// actions whose message the UI shows from the same text in both versions
const SAME_MESSAGE = new Set(["save_questions", "save_concepts", "save_protocol_text", "save_reasons", "set_test_set", "apply_decisions",
  "bulk_decide", "clear_presort", "write_checklist", "export", "prepare_charting", "add_to_library", "report"]);

test("every Review Studio action gives the same messages and files as Python", { skip: skipWithoutReview, timeout: 900_000 }, async () => {
  const ref = pythonReference("session_ref.py", WORK);
  const base = join(WORK, "session");
  const vault = join(base, "js-vault");
  const session = await ReviewSession.open(nodeFolder(join(base, "js", ref.review)), {
    clock: { today: () => ref.today, now: () => ref.now },
    settings: { name: ref.review.replace(/ records$/, ""), recordsPath: ref.recordsPath, generator: PYTHON_GENERATOR,
      template: crlf(await readFile(join(vault, "99 - Templates", "Review Record Template.md"), "utf8")) },
    library: await openLibrary(nodeFolder(join(vault, "98 - Publications"))),
  });
  const messages = [];
  for (const [i, [action, args]] of ref.plan.entries()) {
    const call = CALLS[action];
    assert.ok(call, `no JavaScript call for ${action}`);
    const msg = await call(session, args, vault);
    if (SAME_MESSAGE.has(action)) messages.push([`${i} ${action}`, msg, ref.answers[i]]);
  }
  sameEverywhere("messages", messages);
  await compareFolders(join(base, "py", ref.review), join(base, "js", ref.review));
  await compareFolders(join(base, "py-vault", "98 - Publications"), join(vault, "98 - Publications"));
});
