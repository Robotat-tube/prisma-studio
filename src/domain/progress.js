/**
 * Progress the tool can see in the records: which stages' work is finished, and how far charting is.
 * In-progress stages whose work is finished are marked done automatically, unless the reviewer reopened them.
 * @module domain/progress
 */
import { strip } from "./text-rules.js";
import { CHECKLIST, event } from "./stages.js";

export const isIncluded = props => props.ft_decision === "include";

/** Included records whose every charting field is filled. @returns {[number, number]} done, total */
export function chartingProgress(st, records) {
  const included = records.filter(isIncluded);
  const keys = st.charting.fields.map(f => `chart_${f.name}`);
  const done = included.filter(p => keys.length && keys.every(k => strip(String(p[k] ?? "")))).length;
  return [done, included.length];
}

/**
 * Stages whose work is finished, with what was checked.
 * @param {object} st @param {import("./frontmatter.js").Properties[]} records
 * @returns {Record<string, string>}
 */
export function workComplete(st, records) {
  const out = {};
  if (records.length && !records.some(f => f.ta_decision === "pending")
    && !records.some(f => f.ft_decision === "pending" && f.pdf_status !== "not-retrieved")) {
    out.screening = "every record has a title/abstract and full-text decision";
  }
  const sought = records.filter(f => f.ta_decision === "include" || f.ta_decision === "unsure");
  if (sought.length && sought.every(f => f.pdf_status === "found" || f.pdf_status === "not-retrieved")) {
    out.retrieval = "every report sought has its PDF attached or is marked not retrieved";
  }
  const last = st.snowballing.rounds.at(-1);
  if (last && last.directions.filter(d => d in last).every(d => last[d].new === 0)) {
    out.snowballing = `round ${last.round} found no new records (stop rule)`;
  }
  const [done, total] = chartingProgress(st, records);
  if (total && done === total) {
    out.charting = `all ${total} included sources charted`;
    if (st.charting.appraisal_tool && records.filter(isIncluded).every(p => strip(String(p.appraisal ?? "")))) {
      out.appraisal = `all ${total} included sources appraised`;
    }
  }
  if (CHECKLIST.every(([n]) => (st.checklist[String(n)] ?? {}).done)) out.report = "all PRISMA-ScR checklist items ticked";
  return out;
}

/** Marks in-progress stages done once their work is complete, unless the reviewer reopened them. */
export function autoDone(st, records, now) {
  for (const [key, why] of Object.entries(workComplete(st, records))) {
    const s = st.stages[key];
    if (s.status === "in-progress" && !s.reopened) {
      st.stages[key] = { status: "done", reason: "", updated: now };
      event(st, key, `marked done automatically: ${why}`, now);
    }
  }
}
