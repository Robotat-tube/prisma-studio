/**
 * What the page shows about an open review: one snapshot object with the stages, state, records, counts and
 * checks, in the shape the Review Studio page reads (the Python server's snapshot()).
 * @module ui/view-model
 */
import {
  AI_STEPS, aiMode, aiPrompt, buildQuery, chartingProgress, checkScreening, cohensKappa, normalizeDoi, stageActions, stages, testSet,
} from "../index.js";

const RECORD_FIELDS = ["record_id", "title", "authors", "year", "journal", "doi", "url", "sources", "language",
  "presort", "presort_reason", "ai_decision", "ai_reason", "ai_why", "ai_ft_decision", "ai_ft_reason", "ai_ft_why",
  "publication", "ta_decision", "ta_reason", "ft_decision", "ft_reason", "pdf_status", "oa_url", "pdf", "notes",
  "screened_on", "sample_ta", "r2_ta_decision", "r2_ta_reason", "sample_ft", "r2_ft_decision", "r2_ft_reason",
  "appraisal", "appraisal_note"];

const fileStem = record => record.file.split("/").pop().replace(/\.md$/, "");

/** The abstract of a record note (text after "## Abstract" up to the next heading). */
export function abstractOf(record) {
  const after = record.body.split("## Abstract").slice(1).join("## Abstract") || record.body;
  return after.split("\n## ")[0].trim().replaceAll("_(no abstract in the export)_", "");
}

// Records are replaced, never changed in place, so a record's view can be kept until the record is replaced.
// The snapshot is rebuilt after every action; with thousands of records this keeps that quick.
const VIEWS = new WeakMap();

/** One record as the page lists it (with the abstract when `full`). */
export function recordView(record, full = false) {
  if (full) return { ...listView(record), abstract: abstractOf(record) };
  if (!VIEWS.has(record)) VIEWS.set(record, listView(record));
  return VIEWS.get(record);
}

function listView(record) {
  const p = record.props;
  const out = Object.fromEntries(RECORD_FIELDS.map(k => [k, p[k] ?? ""]));
  out.chart = Object.fromEntries(Object.entries(p).filter(([k]) => k.startsWith("chart_")).map(([k, v]) => [k.slice(6), v]));
  out.file = fileStem(record);
  return out;
}

const count = (values, v) => values.filter(x => x === v).length;
const tally = values => values.reduce((m, v) => ({ ...m, [v]: (m[v] ?? 0) + 1 }), {});
const int = v => parseInt(v || 0, 10) || 0;

/** Counts for the metric tiles and the flow diagram. */
export function flowView(records, searches) {
  const db = searches.filter(s => s.kind === "database"), other = searches.filter(s => s.kind !== "database");
  const nDb = db.reduce((n, s) => n + int(s.records), 0), nOther = other.reduce((n, s) => n + int(s.records), 0);
  const ta = records.map(f => f.ta_decision);
  const sought = records.filter(f => f.ta_decision === "include" || f.ta_decision === "unsure");
  const ft = sought.map(f => f.ft_decision);
  return {
    db: db.map(s => ({ name: s.database, n: int(s.records) })), other: other.map(s => ({ name: s.database, n: int(s.records) })),
    n_db: nDb, n_other: nOther, unique: records.length, duplicates: nDb + nOther - records.length,
    ta_pending: count(ta, "pending"), ta_excluded: count(ta, "exclude"), ta_include: count(ta, "include"), ta_unsure: count(ta, "unsure"),
    sought: sought.length,
    not_retrieved: sought.filter(f => f.pdf_status === "not-retrieved" && f.ft_decision === "pending").length,
    ft_pending: sought.filter(f => ["", "pending"].includes(f.ft_decision ?? "") && f.pdf_status !== "not-retrieved").length,
    assessed: count(ft, "include") + count(ft, "exclude"), ft_excluded: count(ft, "exclude"), included: count(ft, "include"),
    ta_reasons: tally(records.filter(f => f.ta_decision === "exclude").map(f => f.ta_reason || "?")),
    ft_reasons: tally(sought.filter(f => f.ft_decision === "exclude").map(f => f.ft_reason || "?")),
  };
}

/** Agreement with the second reviewer at one stage. */
export function agreementView(records, stage) {
  const key = stage === "ta" ? "ta_decision" : "ft_decision";
  const pairs = [], disagreements = [];
  const decided = records.filter(f => f[`sample_${stage}`] && ["include", "exclude", "unsure"].includes(f[key]) && f[`r2_${stage}_decision`]);
  for (const f of decided.sort((a, b) => String(a.record_id).localeCompare(String(b.record_id)))) {
    const mine = f[key], theirs = f[`r2_${stage}_decision`];
    pairs.push([mine, theirs]);
    if (mine !== theirs) disagreements.push({ record_id: f.record_id, title: f.title, mine, theirs, reason: f[`r2_${stage}_reason`] ?? "" });
  }
  const [agreement, kappa] = cohensKappa(pairs);
  return { sampled: records.filter(f => f[`sample_${stage}`]).length, decided: pairs.length, agreement, kappa, disagreements };
}

/**
 * The page's snapshot of an open review.
 * @param {import("../services/review-session.js").ReviewSession} session
 * @param {{review: string, reviews: string[], vault: string}} context the selected review and the list for the menu
 */
export async function snapshot(session, { review, reviews, vault }) {
  const { repo, st, library } = session;
  const folder = repo.folder;
  const { problems } = await checkScreening(repo, { write: false });
  const integrity = await session.integrityProblems();
  const reasons = await repo.reasons();
  const records = [...repo.records.values()];
  const props = records.map(r => r.props);
  const tests = testSet(library, repo.link);
  const found = new Set(props.filter(p => p.publication).map(p => String(p.publication).replace(/^[[\]]+|[[\]]+$/g, "")));
  const [chartDone, chartTotal] = chartingProgress(st, props);
  const listing = async dir => ((await folder.exists(dir)) ? (await folder.list(dir)) : []);
  const keep = k => Object.fromEntries(k.map(key => [key, st[key]]));
  return {
    review, reviews, dev_mode: session.devMode, vault, folder: folder.name,
    stages: stages.STAGES.map(s => ({ key: s.key, title: s.title, optional: s.optional, desc: s.description, ...st.stages[s.key] })),
    state: keep(["idea", "questions", "concepts", "queries", "pilots", "protocol_text", "protocol_meta", "supervisor_review",
      "concepts_history", "protocol", "amendments", "snowballing", "charting", "checklist"]),
    events: st.events.slice(-200).reverse(),
    queries: Object.fromEntries(st.queries.databases.map(db => [db, buildQuery(st, db)])),
    manual: Object.keys(st.queries.manual),
    searches: await repo.searches(),
    flow: flowView(props, await repo.searches()),
    agreement: { ta: agreementView(props, "ta"), ft: agreementView(props, "ft") },
    problems: [...problems.map(p => ({ record_id: p.record.id, text: p.text })), ...integrity.map(text => ({ record_id: "protocol", text }))],
    reasons: { ta: [...reasons.ta], ft: [...reasons.ft] },
    test_set: { size: tests.length, found: tests.filter(s => found.has(s)).length,
      dois: tests.map(s => normalizeDoi(library.notes.get(s).doi)).filter(Boolean).sort(), papers: [...tests].sort() },
    records: session.records().map(r => recordView(r)),
    rounds: stageActions.roundYield(repo, st).map(([round, added, included]) => ({ round, added, included })),
    charting_progress: [chartDone, chartTotal],
    pdf_folders: st.pdf_folders ?? [],
    ai: {
      modes: Object.fromEntries(Object.keys(AI_STEPS).map(k => [k, aiMode(st, k)])),
      steps: Object.fromEntries(Object.entries(AI_STEPS).map(([k, v]) => [k, {
        skills: [v.skill, ...Object.entries(v.skills ?? {}).filter(([m]) => m === aiMode(st, k)).map(([, n]) => n)],
        checks: v.checks, modes: v.modes.map(([key, label, desc]) => ({ key, label, desc })), prompt: aiPrompt(repo.name, st, k),
      }])),
    },
    library: [...library.notes].sort(([a], [b]) => a.localeCompare(b)).map(([stem, p]) => ({
      stem, doi: normalizeDoi(p.doi), test: (Array.isArray(p.test_in) ? p.test_in : []).includes(repo.link) })),
    lock_checks: await session.lockChecks(),
    checklist_auto: Object.fromEntries(Object.entries(await stageActions.checklistAuto(repo, st)).map(([k, v]) => [String(k), v])),
    checklist_items: stages.CHECKLIST.map(([n, item, desc]) => ({ n, item, desc })),
    protocol_sections: stages.PROTOCOL_SECTIONS.map(([key, title]) => ({ key, title })),
    record_files: Object.fromEntries(records.map(r => [r.id, r.file])),
    sheets: (await listing("09 - Second reviewer")).filter(n => n.endsWith(".csv")),
    "07 - Exports": await listing("07 - Exports"),
  };
}
