// The stage actions (state, protocol, pilots, retrieval, charting, checklist, exports, snowballing, library,
// locking) give the same files as Python on copies of a review, with a fixed clock and the same (fake)
// OpenAlex answers, replayed from the tape the Python run recorded.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pythonReference, sameEverywhere, skipWithoutReview } from "./helpers.js";
import { compareFolders, PYTHON_GENERATOR } from "./folders.js";
import { nodeFolder } from "../../src/adapters/node-folder.js";
import { ReviewRepository } from "../../src/services/review-repository.js";
import { addKeptToLibrary, openLibrary } from "../../src/services/library.js";
import { loadState, saveState } from "../../src/services/review-state.js";
import * as actions from "../../src/services/stage-actions.js";
import { OpenAlexClient } from "../../src/services/openalex-client.js";
import { addIdea, saveQuestions, setStatus } from "../../src/domain/stages.js";
import { setAiMode } from "../../src/domain/ai-steps.js";

const WORK = join(tmpdir(), "prisma-studio-parity");


/** Http port answering from the Python tape; any request Python did not make fails the test. */
function tapeHttp(tape) {
  const asked = new Set();
  return {
    asked,
    async get(url) {
      const u = new URL(url);
      const path = u.pathname.replace(/^\//, "");
      const params = [...u.searchParams].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      const key = JSON.stringify([decodeURIComponent(path), params]);
      if (!(key in tape)) return { status: 404, header: () => null, json: async () => ({}) };
      asked.add(key);
      return { status: 200, header: () => null, json: async () => structuredClone(tape[key]) };
    },
  };
}

test("stage actions write the same state, notes, exports and library notes as Python", { skip: skipWithoutReview, timeout: 900_000 }, async () => {
  const ref = pythonReference("stages_ref.py", WORK);
  const base = join(WORK, "stages");
  const clock = { today: () => ref.today, now: () => ref.now };
  const vault = join(base, "js-vault");
  const repo = await ReviewRepository.open(nodeFolder(join(base, "js", ref.review)), clock, {
    name: ref.review.replace(/ records$/, ""), recordsPath: ref.recordsPath, generator: PYTHON_GENERATOR,
    template: (await readFile(join(vault, "99 - Templates", "Review Record Template.md"), "utf8")).replace(/\r\n?/g, "\n"),
  });
  const library = await openLibrary(nodeFolder(join(vault, "98 - Publications")));
  const http = tapeHttp(ref.tape);
  const openalex = new OpenAlexClient({ http, wait: async () => {} });
  const now = clock.now();
  const st = await loadState(repo.folder);

  addIdea(st, "  A parity-test idea  ", now);
  saveQuestions(st, { population: "P", concept: "C", context: "Ctx", main: "Main question?", sub: ["sub one", " ", "sub two"], why: "testing", amendment: "parity amendment" }, { now });
  setAiMode(st, "screening", "suggest", { reason: "parity: AI suggests", now });
  setStatus(st, "idea", "done", "", now);
  await saveState(repo, st);
  await actions.writeProtocol(repo, st);
  await saveState(repo, st);
  const checks = await actions.protocolLockChecks(repo, st);
  sameEverywhere("lock checks", checks.map((c, i) => [c.label, [c.label, c.ok, c.detail, c.required], ref.lock_checks[i]]));
  sameEverywhere("integrity", [["integrity", await actions.protocolIntegrity(repo, st), ref.integrity]]);
  actions.pilotManual(st, { database: "Scopus", query: "TITLE-ABS-KEY(x)", hits: "1234", note: "by hand", retrieved: "3", available: "4" }, now);
  await actions.pilotOpenalex(repo, st, openalex, library, { note: "fake OpenAlex" });
  const exportName = (await repo.folder.list("07 - Exports")).find(f => f.startsWith("S01 - "));
  await actions.pilotFile(repo, st, library, { fileName: exportName, bytes: await repo.folder.readBytes(`07 - Exports/${exportName}`), database: "Scopus", query: "the S01 string", note: "from export" });
  await saveState(repo, st);
  sameEverywhere("open-access links", [["found", await actions.findOpenAccess(repo, st, openalex), ref.open_access]]);
  const queue = actions.retrievalQueue(repo);
  sameEverywhere("retrieval queue", [["size", queue.length, ref.queue]]);
  if (queue.length) await actions.markPdf(repo, st, queue[0].id, "not-retrieved");
  const included = [...repo.records.values()].filter(r => r.props.ft_decision === "include");
  sameEverywhere("attached record", [["id", included[0].id, ref.attached]]);
  await actions.attachPdf(repo, st, included[0].id, new Uint8Array(await readFile(join(base, "inputs", "paper.pdf"))));
  await saveState(repo, st);
  await actions.prepareCharting(repo, st, { appraisal: true });
  await actions.exportCharting(repo, st);
  await actions.exportBibtex(repo, st);
  actions.setChecklist(st, 4, "  Introduction  ", true, now);
  await actions.writeChecklist(repo, st);
  sameEverywhere("checklist evidence", [["auto", await actions.checklistAuto(repo, st), ref.checklist_auto]]);
  await saveState(repo, st);
  await actions.snowballRound(repo, st, openalex, library, { perSeed: 3 });
  sameEverywhere("round yield", [["yield", actions.roundYield(repo, st), ref.round_yield]]);
  await saveState(repo, st);
  const kept = await addKeptToLibrary(repo, st, library, { template: (await readFile(join(vault, "99 - Templates", "Publication Template.md"), "utf8")).replace(/\r\n?/g, "\n") });
  sameEverywhere("kept papers", [["counts", Object.fromEntries(kept), ref.kept]]);
  await saveState(repo, st);
  st.protocol.locked = "";
  await actions.lockProtocol(repo, st, { registration: "  OSF-PARITY  " });
  await saveState(repo, st);

  assert.equal(http.asked.size, Object.keys(ref.tape).length, "every OpenAlex request Python made was made");
  await compareFolders(join(base, "py", ref.review), join(base, "js", ref.review));
  await compareFolders(join(base, "py-vault", "98 - Publications"), join(vault, "98 - Publications"));
});
