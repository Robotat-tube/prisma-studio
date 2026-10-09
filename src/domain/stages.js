/**
 * The review as a sequence of stages, from the first idea to the report: the stages, the review state kept
 * in review_state.json, and the rules for changing it (status, events, protocol lock and amendments).
 * Functions here change the state object they are given and take the current time from the caller.
 * @module domain/stages
 */
import { strip } from "./text-rules.js";

/** @typedef {{key: string, title: string, optional: boolean, description: string}} Stage */

/** @type {readonly Stage[]} */
export const STAGES = Object.freeze([
  ["idea", "0 · Idea", true, "Write down, with dates, what you want to find out and why; how the idea changes."],
  ["questions", "1 · Research questions", false, "Population–Concept–Context and the review questions; every version is kept."],
  ["concepts", "2 · Concepts and terms", false, "One block per concept with all synonyms and spellings; blocks are combined with AND."],
  ["queries", "3 · Search strings", false, "Search strings generated per database from the concept table; edit by hand if needed."],
  ["pilot", "4 · Pilot and validation", true, "Trial runs: hit count and how many test-set papers the string retrieves."],
  ["protocol", "5 · Protocol", false, "The protocol text, generated from stages 1–4 plus the method sections."],
  ["registration", "6 · Registration", true, "Freeze the protocol (git commit and/or OSF) before searching."],
  ["searches", "7 · Database searches", false, "Import every final database export with the exact string and date."],
  ["screening", "8 · Screening", false, "Title/abstract, then full text, in Screening.base."],
  ["reviewer", "9 · Second reviewer", true, "Independent screening of a ≥ 20 % sample; Cohen's κ."],
  ["retrieval", "10 · Full-text retrieval", false, "Find, attach or mark as not retrieved the full texts to assess."],
  ["snowballing", "11 · Snowballing", true, "Citation rounds from the full-text includes; new records go through screening and retrieval again, until a round adds no new included study."],
  ["charting", "12 · Data charting", false, "Fill the charting form for every included source, with page locators."],
  ["appraisal", "13 · Critical appraisal", true, "Optional in scoping reviews; appraise each included source."],
  ["report", "14 · Report", false, "PRISMA flow, PRISMA-ScR checklist, exports for writing."],
].map(([key, title, optional, description]) => Object.freeze({ key, title, optional, description })));

/** @type {Readonly<Record<string, Stage>>} */
export const STAGE = Object.freeze(Object.fromEntries(STAGES.map(s => [s.key, s])));

export const FULLTEXT_DIR = "10 - Full texts";
export const STATUS_ICON = Object.freeze({ "not-started": "○", "in-progress": "◐", done: "●", skipped: "⤼" });
export const PROTECTED = Object.freeze(["questions", "concepts", "queries", "protocol_text", "charting", "criteria"]);
export const DEFAULT_DATABASES = Object.freeze(["Scopus", "Web of Science", "IEEE Xplore", "OpenAlex"]);

export const DEFAULT_FIELDS = Object.freeze([
  { name: "study_type", description: "Study type / design (e.g. case study, method development, LCA, review)" },
  { name: "product_domain", description: "Products or systems studied" },
  { name: "modularity_definition", description: "How modularity is defined or measured" },
  { name: "method", description: "Method or approach used" },
  { name: "criteria", description: "Criteria or outcomes assessed (impact, cost, repair, upgrade, ...)" },
  { name: "key_findings", description: "Main findings relevant to the review questions" },
  { name: "locators", description: "Page / section / table locators for the values above" },
].map(Object.freeze));

/** @type {readonly [string, string][]} section key, heading */
export const PROTOCOL_SECTIONS = Object.freeze([
  ["rationale", "Background and rationale (PRISMA-ScR 3)"],
  ["eligibility", "Eligibility criteria with rationale (PRISMA-ScR 6)"],
  ["sources", "Information sources (PRISMA-ScR 7)"],
  ["selection", "Selection of sources of evidence (PRISMA-ScR 9)"],
  ["charting", "Data charting process (PRISMA-ScR 10)"],
  ["appraisal", "Critical appraisal (PRISMA-ScR 12)"],
  ["synthesis", "Synthesis of results (PRISMA-ScR 13)"],
  ["timeline", "Timeline and team"],
]);

/** @type {readonly [number, string, string][]} PRISMA-ScR item, name, what to report */
export const CHECKLIST = Object.freeze([
  [1, "Title", "Identify the report as a scoping review."],
  [2, "Structured summary", "Background, objectives, eligibility, sources, charting, results, conclusions."],
  [3, "Rationale", "Why the review is needed."],
  [4, "Objectives", "Questions and objectives (PCC elements)."],
  [5, "Protocol and registration", "Whether a protocol exists, where, registration number."],
  [6, "Eligibility criteria", "Characteristics used as criteria, with rationale."],
  [7, "Information sources", "Databases, dates of coverage, other sources, date last searched."],
  [8, "Search", "Full electronic search strategy for at least one database."],
  [9, "Selection of sources of evidence", "Screening and selection process."],
  [10, "Data charting process", "Methods of charting, calibration, who charted."],
  [11, "Data items", "All variables for which data were sought."],
  [12, "Critical appraisal", "Methods of appraisal, if done."],
  [13, "Synthesis of results", "Methods of handling and summarising the data."],
  [14, "Selection of sources of evidence", "Numbers screened / assessed / included, with flow diagram."],
  [15, "Characteristics of sources", "Characteristics of each source charted."],
  [16, "Critical appraisal within sources", "Appraisal data, if done."],
  [17, "Results of individual sources", "Relevant data charted per source."],
  [18, "Synthesis of results", "Summary of charted results related to the objectives."],
  [19, "Summary of evidence", "Main results, links to the questions."],
  [20, "Limitations", "Limitations of the scoping review process."],
  [21, "Conclusions", "General interpretation and implications."],
  [22, "Funding", "Sources of funding and role of funders."],
]);

/** A deep copy of plain data (state values are JSON). */
const copy = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/** Equality of JSON-like values: deep, key order ignored. */
export function sameValue(a, b) {
  if (a === b) return true;
  if (typeof a === "boolean" || typeof b === "boolean") return Number(a) === Number(b) && typeof a !== "string" && typeof b !== "string";
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => Object.hasOwn(b, k) && sameValue(a[k], b[k]));
  }
  return false;
}

/** A new review's state. */
export function defaultState() {
  return {
    version: 1,
    stages: Object.fromEntries(STAGES.map(s => [s.key, { status: "not-started", reason: "", updated: "" }])),
    idea: [],
    questions: { population: "", concept: "", context: "", main: "", sub: [], history: [] },
    concepts: [],
    queries: { databases: [...DEFAULT_DATABASES], manual: {} },
    pilots: [],
    protocol_text: Object.fromEntries(PROTOCOL_SECTIONS.map(([k]) => [k, ""])),
    protocol_meta: {},
    supervisor_review: {},
    concepts_history: [],
    protocol: { locked: "", file: "", sha256: "", registration: "", commit: "", snapshot: {} },
    amendments: [],
    snowballing: { rounds: [] },
    charting: { fields: DEFAULT_FIELDS.map(f => ({ ...f })), appraisal_tool: "" },
    checklist: {},
    ai: {},
    events: [],
  };
}

/** The saved state over the defaults: saved objects update the default ones key by key (one level). */
export function restoreState(saved) {
  const st = defaultState();
  for (const [k, v] of Object.entries(saved ?? {})) {
    const isObject = x => x && typeof x === "object" && !Array.isArray(x);
    if (isObject(v) && isObject(st[k])) Object.assign(st[k], v);
    else st[k] = v;
  }
  for (const s of STAGES) st.stages[s.key] ??= { status: "not-started", reason: "", updated: "" };
  return st;
}

/** Adds a dated event to the timeline. */
export function event(st, stage, text, now) {
  st.events.push({ when: now, stage, text });
}

/** A stage that has not started becomes in progress. */
export function touch(st, stage, now) {
  const s = st.stages[stage];
  if (s.status === "not-started") { s.status = "in-progress"; s.updated = now; }
}

/** Sets a stage's status by hand; skipping needs a reason and is only allowed for optional stages. */
export function setStatus(st, stage, status, reason, now) {
  if (status === "skipped" && !STAGE[stage].optional) throw new Error(`${STAGE[stage].title} is required and cannot be skipped.`);
  if (status === "skipped" && !strip(reason ?? "")) throw new Error("A reason is required to skip a stage.");
  st.stages[stage] = { status, reason: strip(reason ?? ""), updated: now };
  if (status === "in-progress") st.stages[stage].reopened = true;    // no automatic "done" until marked again
  event(st, stage, { done: "marked done", skipped: `skipped — ${strip(reason ?? "")}`, "in-progress": "reopened", "not-started": "reset" }[status], now);
}

export const isLocked = st => Boolean(st.protocol.locked);

/** A change to a protected part needs an amendment when the protocol is locked and developer mode is off. */
export const needsAmendment = (st, devMode) => isLocked(st) && !devMode;

/** Records an amendment (a change to a protected part after locking) with its reason. */
export function amend(st, what, reason, now) {
  if (!strip(reason ?? "")) throw new Error("The protocol is locked: give the reason for this amendment.");
  st.amendments.push({ when: now, what, reason: strip(reason) });
  event(st, "protocol", `amendment (${what}): ${strip(reason)}`, now);
}

/** Changes made in developer mode after locking are still written to the timeline. */
function devNote(st, what, devMode, now) {
  if (isLocked(st) && devMode) event(st, "protocol", `developer mode: ${what} changed without an amendment`, now);
}

/**
 * Replaces a protected part of the state; after locking this needs an amendment reason.
 * @returns {boolean} whether anything changed
 */
export function guardedChange(st, key, value, { reason = "", devMode = false, now }) {
  if (sameValue(st[key], value)) return false;
  if (needsAmendment(st, devMode)) amend(st, key, reason, now);
  else devNote(st, key, devMode, now);
  st[key] = copy(value);
  return true;
}

/** Adds a dated note to the idea log. */
export function addIdea(st, text, now) {
  st.idea.push({ when: now, text: strip(text) });
  touch(st, "idea", now);
  event(st, "idea", "idea note added", now);
}

/** Saves a new version of the review questions; the old version is kept with the reason for the change. */
export function saveQuestions(st, { population, concept, context, main, sub, why, amendment = "" }, { devMode = false, now }) {
  const q = st.questions;
  const next = { population: strip(population), concept: strip(concept), context: strip(context), main: strip(main), sub: sub.map(strip).filter(Boolean) };
  const old = Object.fromEntries(Object.keys(next).map(k => [k, q[k]]));
  if (sameValue(next, old)) return false;
  if (needsAmendment(st, devMode)) amend(st, "questions", amendment || why, now);
  else devNote(st, "questions", devMode, now);
  q.history.push({ when: now, why: strip(why), ...copy(old) });
  Object.assign(q, next);
  touch(st, "questions", now);
  event(st, "questions", `questions revised — ${strip(why) || "no reason given"}`, now);
  return true;
}
