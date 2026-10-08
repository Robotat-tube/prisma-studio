/**
 * How an AI assistant reads from and writes to a review (used by the skills in .claude/skills/review-*).
 *
 * Every function checks the AI mode the review chose for that step and refuses when it is off. Writes go
 * through the same rules as the app and are logged in the timeline with the model name. The AI never sets
 * the reviewer's decisions (ta_decision / ft_decision); it writes suggestions the reviewer confirms.
 * @module services/ai-assist
 */
import * as csv from "../domain/csv.js";
import { aiMode } from "../domain/ai-steps.js";
import { isIncluded } from "../domain/progress.js";
import { comparePy, normalizeNewlines, strip } from "../domain/pytext.js";
import { event, FULLTEXT_DIR, touch } from "../domain/stages.js";
import { SECOND_REVIEWER_DIR } from "../domain/sampling.js";
import { importSecondReviewer, ReviewError } from "./review-commands.js";
import { loadState, saveState } from "./review-state.js";
import { retrievalQueue } from "./stage-actions.js";
import * as actions from "./stage-actions.js";

/** The AI tried something the review's settings do not allow; the message tells the reviewer what to do. */
export class AiNotAllowed extends ReviewError {}

const stem = r => r.file.split("/").pop().replace(/\.md$/, "");
const pdfPath = r => `${FULLTEXT_DIR}/${stem(r)}.pdf`;
// Python's dict.get gives None (JSON null) for a missing property; JavaScript would drop the key
const get = (props, key) => props[key] ?? null;
const codes = reasons => new Set(reasons.map(r => r.split(" ")[0]));

/** The mode of a step, or AiNotAllowed when the review switched the AI off for it. */
export function requireMode(st, step) {
  if (step === "fulltext") {
    if (aiMode(st, "screening") !== "suggest-ft") {
      throw new AiNotAllowed("AI full-text suggestions are off for this review. The reviewer can choose 'AI suggests (+ full text)' in Review Studio (8 · Screening, AI assistance card).");
    }
    return "suggest-ft";
  }
  const mode = aiMode(st, step);
  if (mode === "off") throw new AiNotAllowed(`AI assistance for '${step}' is off for this review. Switch it on in Review Studio (stage page, AI assistance card) if the reviewer wants it.`);
  return mode;
}

/** Text of a "## name" section of a record (the placeholder for a missing abstract removed). */
function section(body, name) {
  const at = body.indexOf(`## ${name}`);
  if (at < 0) return "";
  return strip(body.slice(at + name.length + 3).split("\n## ")[0]).replaceAll("_(no abstract in the export)_", "");
}

async function criteria(repo, st, rel) {
  const reasons = await repo.reasons();
  return {
    questions: Object.fromEntries(["population", "concept", "context", "main", "sub"].map(k => [k, get(st.questions, k)])),
    eligibility: st.protocol_text.eligibility ?? "", screening_guide: rel("08 - Screening guide.md"),
    ta_reasons: [...reasons.ta], ft_reasons: [...reasons.ft],
  };
}

/** The newest blind sheet (not a filled-in "(AI)" copy). */
export async function latestSheet(folder) {
  const names = (await folder.list(SECOND_REVIEWER_DIR)).filter(n => /^(ta|ft)-sample .*\.csv$/.test(n) && !n.endsWith("(AI).csv"));
  const ordered = [...names.filter(n => n.startsWith("ta")), ...names.filter(n => n.startsWith("ft"))];
  let best = null, bestTime = -Infinity;
  for (const n of ordered) {
    const t = await folder.lastModified(`${SECOND_REVIEWER_DIR}/${n}`);
    if (t > bestTime) { best = n; bestTime = t; }
  }
  return best;
}

/**
 * What the AI needs for a step: criteria, and the records still to do (at most `limit`).
 * @param {import("./review-repository.js").ReviewRepository} repo @param {object} st
 * @param {"screening"|"fulltext"|"reviewer"|"retrieval"|"charting"} step
 * @param {{limit?: number, rel?: (path: string) => string}} [options] rel turns a review path into the path shown
 */
export async function aiContext(repo, st, step, { limit = 40, rel = p => p } = {}) {
  const mode = requireMode(st, step);
  const out = { review: repo.name, step, mode, folder: rel("") };
  const records = [...repo.records.values()];
  const hasPdf = async r => repo.folder.exists(pdfPath(r));
  if (step === "screening") {
    const todo = records.filter(r => r.props.ta_decision === "pending" && !r.props.ai_decision);
    Object.assign(out, await criteria(repo, st, rel), { remaining: todo.length });
    out.records = todo.slice(0, limit).map(r => ({ id: r.props.record_id, title: r.props.title, year: get(r.props, "year"), journal: get(r.props, "journal"),
      abstract: section(r.body, "Abstract"), keywords: section(r.body, "Keywords") }));
  } else if (step === "fulltext") {
    const todo = records.filter(r => ["include", "unsure"].includes(r.props.ta_decision) && (r.props.ft_decision || "pending") === "pending" && !r.props.ai_ft_decision);
    Object.assign(out, await criteria(repo, st, rel), { remaining: todo.length });
    const withPdf = [];
    for (const r of todo) if (await hasPdf(r)) withPdf.push(r);
    out.without_pdf = todo.length - withPdf.length;
    out.records = withPdf.slice(0, limit).map(r => ({ id: r.props.record_id, title: r.props.title, year: get(r.props, "year"), pdf: rel(pdfPath(r)) }));
  } else if (step === "reviewer") {
    const sheet = await latestSheet(repo.folder);
    if (!sheet) throw new ReviewError("no blind sheet yet: draw the sample in Review Studio (9 · Second reviewer) first.");
    const rows = csv.readRecords(normalizeNewlines(await repo.folder.readText(`${SECOND_REVIEWER_DIR}/${sheet}`)).replace(/^﻿/, ""));
    Object.assign(out, await criteria(repo, st, rel), { sheet: rel(`${SECOND_REVIEWER_DIR}/${sheet}`), stage: sheet.slice(0, 2),
      records: rows.map(row => Object.fromEntries(["record_id", "title", "year", "journal", "abstract"].map(k => [k, row[k]]))) });
  } else if (step === "retrieval") {
    out.destination = rel(FULLTEXT_DIR);
    out.records = retrievalQueue(repo).filter(r => r.props.pdf_status !== "found").slice(0, limit).map(r => ({
      id: r.props.record_id, title: r.props.title, authors: get(r.props, "authors"), year: get(r.props, "year"), doi: get(r.props, "doi"), url: get(r.props, "url"),
      oa_url: r.props.oa_url ?? "", pdf_status: r.props.pdf_status ?? "" }));
  } else if (step === "charting") {
    const fields = st.charting.fields.filter(f => f.name !== "checked_by");     // the reviewer's own field
    const keys = fields.map(f => `chart_${f.name}`);
    const filled = (r, k) => strip(String(r.props[k] ?? ""));
    const todo = records.filter(r => isIncluded(r.props) && !keys.every(k => filled(r, k)) && r.props.chart_checked_by !== "reviewer");
    Object.assign(out, { questions: (await criteria(repo, st, rel)).questions, fields, remaining: todo.length, records: [] });
    for (const r of todo.slice(0, limit)) {
      out.records.push({ id: r.props.record_id, title: r.props.title, pdf: (await hasPdf(r)) ? rel(pdfPath(r)) : "",
        filled: Object.fromEntries(keys.filter(k => filled(r, k)).map(k => [k.slice(6), r.props[k]])) });
    }
  }
  return out;
}

/**
 * Writes AI screening suggestions (never decisions) for records the reviewer has not decided.
 * @param {{id: string, decision: string, reason?: string, why?: string}[]} items
 * @returns {Promise<{written: number, skipped: string[], message: string}>}
 */
export async function aiSuggest(repo, st, items, { model, stage = "ta" }) {
  const ft = stage === "ft";
  requireMode(st, ft ? "fulltext" : "screening");
  const reasons = await repo.reasons();
  const allowed = codes(ft ? reasons.ft : reasons.ta);
  const [dkey, pre] = ft ? ["ft_decision", "ai_ft_"] : ["ta_decision", "ai_"];
  let written = 0;
  const skipped = [];
  for (const it of items) {
    const r = repo.records.get(it.id);
    const decision = it.decision, code = (it.reason || "").split(" ")[0];
    if (!r) { skipped.push(`${it.id}: unknown record`); continue; }
    if ((r.props[dkey] || "pending") !== "pending" || (ft && !["include", "unsure"].includes(r.props.ta_decision))) { skipped.push(`${it.id}: already decided by the reviewer, left alone`); continue; }
    if (ft && !(await repo.folder.exists(pdfPath(r)))) { skipped.push(`${it.id}: no full text attached; suggest only from the PDF`); continue; }
    if (!["include", "unsure", "exclude"].includes(decision)) { skipped.push(`${it.id}: decision must be include / unsure / exclude`); continue; }
    if (decision === "exclude" && !allowed.has(code)) { skipped.push(`${it.id}: exclusion needs a reason code from the screening guide (${[...allowed].sort(comparePy).join(", ")})`); continue; }
    repo.put({ ...r, props: { ...r.props, [pre + "decision"]: decision, [pre + "reason"]: decision === "exclude" ? code : "", [pre + "why"]: strip(it.why || "") } });
    written++;
  }
  if (written) {
    await repo.save();
    touch(st, "screening", repo.clock.now());
    event(st, "screening", `AI (${model}) suggested ${ft ? "full-text" : "title/abstract"} decisions for ${written} record(s); awaiting the reviewer`, repo.clock.now());
    await saveState(repo, st);
  }
  const message = `${written} suggestion(s) written. The reviewer confirms them in Review Studio (Screening, ${ft ? "Full text" : "Title / abstract"} tab, Suggested queue).`;
  return { written, skipped, message };
}

/**
 * The AI as blind second reviewer: fills a copy of the newest sheet ("… (AI).csv"), imports it and logs the model.
 * @param {{record_id: string, decision: string, reason?: string}[]} decisions one for every record on the sheet
 */
export async function aiSecondReviewer(repo, st, decisions, { model, library }) {
  requireMode(st, "reviewer");
  const sheet = await latestSheet(repo.folder);
  if (!sheet) throw new ReviewError("no blind sheet to fill.");
  const byId = new Map(decisions.map(d => [d.record_id, d]));
  const [head, ...rows] = csv.readRows(normalizeNewlines(await repo.folder.readText(`${SECOND_REVIEWER_DIR}/${sheet}`)).replace(/^﻿/, ""));
  const col = name => head.indexOf(name);
  for (const row of rows) {
    const d = byId.get(row[col("record_id")]) ?? {};
    if (!["include", "exclude", "unsure"].includes(d.decision)) throw new ReviewError(`${row[col("record_id")]}: no valid decision (include / exclude / unsure)`);
    row[col("decision")] = d.decision;
    row[col("reason")] = (d.reason || "").split(" ")[0];
  }
  const name = sheet.replace(/\.csv$/, " (AI).csv");
  const text = "﻿" + csv.writeRows([head, ...rows]);
  await repo.folder.writeText(`${SECOND_REVIEWER_DIR}/${name}`, text);
  const stage = sheet.slice(0, 2);
  const message = await importSecondReviewer(repo, { fileName: name, text, stage }, library);
  const fresh = await loadState(repo.folder);
  (fresh.reviewer_ai ??= {})[stage] = { model, when: repo.clock.now(), sheet: name };
  touch(fresh, "reviewer", repo.clock.now());
  event(fresh, "reviewer", `AI (${model}) filled the blind ${stage} sheet as second reviewer (${rows.length} records)`, repo.clock.now());
  await saveState(repo, fresh);
  Object.assign(st, fresh);
  return message;
}

/** Attaches a PDF the AI fetched; the record's notes say so. */
export async function aiAttach(repo, st, recordId, bytes, { model }) {
  requireMode(st, "retrieval");
  if (!repo.records.has(recordId)) throw new ReviewError(`unknown record ${recordId}`);
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new ReviewError("not a PDF file");
  await actions.attachPdf(repo, st, recordId, bytes);
  const r = repo.records.get(recordId);
  repo.put({ ...r, props: { ...r.props, notes: strip((r.props.notes || "") + ` [full text fetched by AI (${model})]`) } });
  await repo.save();
  await saveState(repo, st);
  return `${recordId}: attached as ${stem(r)}.pdf`;
}

/**
 * Prefills empty charting fields of included records; every record touched stays "checked by AI" until
 * the reviewer checks it. @param {{id: string, fields: Record<string, unknown>}[]} items @returns {Promise<string[]>} report lines
 */
export async function aiChart(repo, st, items, { model }) {
  requireMode(st, "charting");
  const names = new Set(st.charting.fields.map(f => f.name).filter(n => n !== "checked_by"));
  const lines = [];
  let n = 0;
  for (const it of items) {
    const r = repo.records.get(it.id);
    if (!r || !isIncluded(r.props)) { lines.push(`  skipped ${it.id}: not an included record`); continue; }
    if (r.props.chart_checked_by === "reviewer") { lines.push(`  skipped ${it.id}: already checked by the reviewer`); continue; }
    const props = { ...r.props }, wrote = [];
    for (const [k, v] of Object.entries(it.fields ?? {})) {
      if (names.has(k) && !strip(String(props[`chart_${k}`] ?? "")) && strip(String(v))) { props[`chart_${k}`] = strip(String(v)); wrote.push(k); }
    }
    if (!wrote.length) continue;
    props.chart_checked_by = "AI";
    repo.put({ ...r, props });
    n++;
    lines.push(`${it.id}: ${wrote.join(", ")}`);
  }
  if (n) {
    await repo.save();
    touch(st, "charting", repo.clock.now());
    event(st, "charting", `AI (${model}) prefilled charting fields for ${n} record(s); to be checked by the reviewer`, repo.clock.now());
    await saveState(repo, st);
  }
  return lines;
}
