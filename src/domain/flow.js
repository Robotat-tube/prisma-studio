/**
 * The PRISMA flow: how many records were identified, screened, sought, assessed and included, and why
 * records were excluded.
 * @module domain/flow
 */
import { comparePy } from "./pytext.js";

/** @typedef {{id: string, kind: string, database: string, date: string, query: string, filters: string,
 *   export: string, records: string|number, new: string|number, duplicates: string|number}} SearchRow */

const count = (items, value) => items.filter(v => v === value).length;
const toInt = v => parseInt(v || 0, 10) || 0;

/** Counts of each value, sorted by value as Python's sorted(Counter.items()). @returns {[string, number][]} */
function tally(values) {
  const m = new Map();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].sort(([a], [b]) => comparePy(String(a), String(b)));
}

/**
 * @param {import("./frontmatter.js").Properties[]} recs record properties
 * @param {SearchRow[]} searches rows of 07 - Searches.csv
 */
export function flowCounts(recs, searches) {
  const db = searches.filter(s => s.kind === "database"), other = searches.filter(s => s.kind !== "database");
  const identifiedDb = db.reduce((n, s) => n + toInt(s.records), 0);
  const identifiedOther = other.reduce((n, s) => n + toInt(s.records), 0);
  const ta = recs.map(f => f.ta_decision);
  const sought = recs.filter(f => f.ta_decision === "include" || f.ta_decision === "unsure");
  const assessedPool = sought.filter(f => f.pdf_status !== "not-retrieved" || f.ft_decision !== "pending").map(f => f.ft_decision);
  return {
    db, other, identifiedDb, identifiedOther,
    unique: recs.length,
    duplicates: identifiedDb + identifiedOther - recs.length,
    taPending: count(ta, "pending"), taExcluded: count(ta, "exclude"),
    sought: sought.length,
    notRetrieved: sought.filter(f => f.pdf_status === "not-retrieved").length,
    ftPending: count(assessedPool, "pending"), ftExcluded: count(assessedPool, "exclude"), included: count(assessedPool, "include"),
    assessed: count(assessedPool, "include") + count(assessedPool, "exclude"),
    taReasons: tally(recs.filter(f => f.ta_decision === "exclude").map(f => f.ta_reason || "(no reason)")),
    ftReasons: tally(sought.filter(f => f.ft_decision === "exclude").map(f => f.ft_reason || "(no reason)")),
  };
}
