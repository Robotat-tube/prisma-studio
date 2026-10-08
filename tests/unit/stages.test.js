// Stage rules, search strings, protocol, notes and OpenAlex conversion, without files or network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addIdea, amend, defaultState, guardedChange, restoreState, sameValue, saveQuestions, setStatus, touch } from "../../src/domain/stages.js";
import { aiMode, aiPrompt, setAiMode } from "../../src/domain/ai-steps.js";
import { buildQuery, cleanTerms, openalexWord } from "../../src/domain/queries.js";
import { integrityProblems, lockChecks, protocolMarkdown } from "../../src/domain/protocol.js";
import { autoDone, chartingProgress, workComplete } from "../../src/domain/progress.js";
import { bibtex, timelineNote } from "../../src/domain/stage-notes.js";
import { abstractFromIndex, workToEntry } from "../../src/domain/openalex.js";
import { fileTitle, nextIndex, shortAuthors } from "../../src/domain/publications.js";
import { DEFAULT_FT_REASONS, DEFAULT_TA_REASONS } from "../../src/domain/vocabulary.js";
import { OpenAlexClient } from "../../src/services/openalex-client.js";

const NOW = "2026-01-15 10:00";
const reasons = { ta: DEFAULT_TA_REASONS, ft: DEFAULT_FT_REASONS };

test("state: defaults, restore, status, amendments", () => {
  const st = restoreState({ stages: { idea: { status: "done", reason: "", updated: "x" } }, custom: 1 });
  assert.equal(st.stages.idea.status, "done");
  assert.equal(st.stages.report.status, "not-started");
  assert.equal(st.custom, 1);
  touch(st, "questions", NOW);
  assert.equal(st.stages.questions.status, "in-progress");
  assert.throws(() => setStatus(st, "questions", "skipped", "no", NOW), /required/);
  assert.throws(() => setStatus(st, "idea", "skipped", " ", NOW), /reason/);
  setStatus(st, "pilot", "in-progress", "", NOW);
  assert.equal(st.stages.pilot.reopened, true);
  st.protocol.locked = "2026-01-01";
  assert.throws(() => guardedChange(st, "concepts", [{ name: "x" }], { now: NOW }), /amendment/);
  assert.equal(guardedChange(st, "concepts", [{ name: "x" }], { reason: "pilot", now: NOW }), true);
  assert.equal(st.amendments.at(-1).what, "concepts");
  assert.equal(guardedChange(st, "concepts", [{ name: "x" }], { now: NOW }), false, "no change, no amendment");
  assert.equal(guardedChange(st, "ai", { screening: "suggest" }, { devMode: true, now: NOW }), true);
  assert.match(st.events.at(-1).text, /developer mode/);
  assert.throws(() => amend(st, "x", "", NOW));
  assert.ok(sameValue({ a: [1, { b: true }] }, { a: [1, { b: 1 }] }));
  assert.ok(!sameValue("", false));
});

test("questions, ideas and AI modes", () => {
  const st = defaultState();
  addIdea(st, "  idea  ", NOW);
  assert.equal(st.idea[0].text, "idea");
  assert.equal(saveQuestions(st, { population: "P", concept: "C", context: "X", main: "Q?", sub: ["a", " "], why: "first" }, { now: NOW }), true);
  assert.equal(saveQuestions(st, { population: "P", concept: "C", context: "X", main: "Q?", sub: ["a"], why: "same" }, { now: NOW }), false);
  assert.deepEqual(st.questions.history[0], { when: NOW, why: "first", population: "", concept: "", context: "", main: "", sub: [] });
  assert.equal(aiMode(st, "screening"), "off");
  setAiMode(st, "screening", "suggest-ft", { now: NOW });
  assert.equal(aiPrompt("R", st, "screening"), 'Use the skills review-screen-abstracts and review-screen-fulltexts for the review "R" (mode: suggest-ft).');
  assert.throws(() => setAiMode(st, "screening", "nope", { now: NOW }));
});

test("search strings per database", () => {
  assert.deepEqual(cleanTerms("a; b\n\nc"), ["a", "b", "c"]);
  assert.equal(openalexWord("repairab* disassembl* scor* modul*"), "repairability disassembly score modul");
  const st = defaultState();
  st.concepts = [{ name: "Mod", terms: ["modular*", "module identification"] }, { name: "El", terms: ["electronic*"] }, { name: "Not", role: "NOT", terms: ["software"] }];
  assert.equal(buildQuery(st, "Scopus"), 'TITLE-ABS-KEY((modular* OR "module identification") AND (electronic*) AND NOT (software))');
  assert.equal(buildQuery(st, "Web of Science"), 'TS=((modular* OR "module identification") AND (electronic*) AND NOT (software))');
  assert.equal(buildQuery(st, "IEEE Xplore"), '("All Metadata":modular* OR "All Metadata":"module identification") AND ("All Metadata":electronic*) AND NOT ("All Metadata":software)');
  assert.equal(buildQuery(st, "OpenAlex"), '(modular OR "module identification") AND (electronic) NOT (software)');
  st.queries.manual.Scopus = "hand-made";
  assert.equal(buildQuery(st, "Scopus"), "hand-made");
});

test("protocol, lock checks and integrity", () => {
  const st = defaultState();
  const text = protocolMarkdown({ reviewName: "R", reviewLink: "[[R]]", st, ftReasons: reasons.ft, generatedBy: "test" });
  assert.match(text, /status: "draft"/);
  assert.match(text, /_\(to be written\)_/);
  assert.match(text, /Exclusion reasons used in screening:\n- E1 wrong concept/);
  const checks = lockChecks(st, reasons);
  assert.deepEqual(checks.filter(c => !c.ok).map(c => c.label).slice(0, 2), ["Review questions written", "Concept table and search strings"]);
  st.protocol_text.rationale = "See [citation here].";
  assert.match(lockChecks(st, reasons).find(c => c.label === "No placeholders left").detail, /\[citation here\]/);
  st.protocol = { locked: "2026-01-01", file: "06.md", sha256: "abc", snapshot: { ta_reasons: [...reasons.ta], ft_reasons: [...reasons.ft] } };
  assert.deepEqual(integrityProblems(st, reasons, "abc"), []);
  assert.equal(integrityProblems(st, { ta: ["E1 x"], ft: reasons.ft }, "zzz").length, 2);
});

test("progress: finished work marks in-progress stages done", () => {
  const st = defaultState();
  const recs = [{ ta_decision: "include", ft_decision: "include", pdf_status: "found", chart_study_type: "x" }];
  st.charting.fields = [{ name: "study_type", description: "" }];
  assert.deepEqual(chartingProgress(st, recs), [1, 1]);
  assert.deepEqual(Object.keys(workComplete(st, recs)), ["screening", "retrieval", "charting"]);
  st.stages.screening.status = "in-progress";
  st.stages.retrieval = { status: "in-progress", reason: "", updated: "", reopened: true };
  autoDone(st, recs, NOW);
  assert.equal(st.stages.screening.status, "done");
  assert.equal(st.stages.retrieval.status, "in-progress", "a reopened stage stays open");
});

test("notes: timeline and BibTeX", () => {
  const st = defaultState();
  st.events.push({ when: NOW, stage: "idea", text: "a | b" });
  assert.match(timelineNote({ reviewName: "R", reviewLink: "[[R]]", st, today: "2026-01-15" }), /\| 2026-01-15 10:00 \| 0 · Idea \| a \/ b \|/);
  assert.equal(bibtex([{ record_id: "R0001", authors: "Liu, Z.; Zhong, P.", year: 2024, title: "T", journal: "", doi: "10.1/x" }]),
    "@article{Liu2024R0001,\n  title = {T},\n  author = {Liu, Z. and Zhong, P.},\n  year = {2024},\n  doi = {10.1/x}\n}\n");
});

test("OpenAlex works and publication names", () => {
  assert.equal(abstractFromIndex({ world: [1], hello: [0] }), "hello world");
  const e = workToEntry({ id: "https://openalex.org/W1", doi: "https://doi.org/10.1/X", title: "T", publication_year: 2020,
    authorships: [{ author: { display_name: "Ann Lee" } }, { author: null }], primary_location: { source: { display_name: "J" } } });
  assert.deepEqual([e.authors, e.doi, e.journal, e.url], ["Ann Lee", "10.1/x", "J", "https://doi.org/10.1/X"]);
  assert.equal(shortAuthors("Liu, Z. and Zhong, P."), "Liu & Zhong");
  assert.equal(fileTitle("A: very/long " + "word ".repeat(30)).length <= 90, true);
  assert.equal(nextIndex(new Map([["a", { index: 7 }], ["b", { index: "12" }], ["c", {}]])), 13);
});

test("OpenAlex client spaces calls, retries and explains a used-up budget", async () => {
  const waits = [];
  const answers = [{ status: 503 }, { status: 200, body: { ok: 1 } }];
  const http = { get: async () => { const a = answers.shift(); return { status: a.status, header: () => null, json: async () => a.body }; } };
  let t = 0;
  const client = new OpenAlexClient({ http, wait: async ms => { waits.push(ms); t += ms; }, monotonic: () => t });
  assert.deepEqual(await client.get("works", { filter: "x" }), { ok: 1 });
  assert.equal(waits[0], 1000, "first retry after 1 s");
  const budget = new OpenAlexClient({ http: { get: async () => ({ status: 429, header: n => (n === "X-RateLimit-Remaining" ? "0" : null), json: async () => ({}) }) }, wait: async () => {} });
  await assert.rejects(budget.get("works"), /daily budget/);
});

test("PDF matching: DOI first, title needs the first author, letter-spaced names", async () => {
  const { matchPdfs, summarizePdf, firstAuthor } = await import("../../src/domain/pdf-matching.js");
  const records = new Map([
    ["R1", { doi: "10.1000/abc", title: "Anything", authors: "Liu, Z." }],
    ["R2", { title: "Design structure matrix methods for products", authors: "Jiao, J.; Tseng, M." }],
    ["R3", { title: "Design structure matrix", authors: "Other, O." }],
  ]);
  const pdfs = [
    { path: "a.pdf", name: "a.pdf", ...summarizePdf("Some paper DOI: 10.1000/ABC). text") },
    { path: "b.pdf", name: "b.pdf", ...summarizePdf("Design Structure Matrix Methods for Products\nJ I A O and M. Tseng") },
  ];
  assert.deepEqual(matchPdfs(records, pdfs).map(m => [m.record_id, m.how, m.pdf]), [["R1", "doi", "a.pdf"], ["R2", "title", "b.pdf"]]);
  assert.equal(firstAuthor("Agus Sudjianto; Kevin Otto"), "sudjianto");
});
