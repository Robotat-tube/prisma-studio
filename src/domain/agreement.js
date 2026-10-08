/**
 * Agreement between the reviewer and the second reviewer on the sampled records (Cohen's κ).
 * @module domain/agreement
 */

/**
 * Observed agreement and Cohen's κ for [first, second] decision pairs; both null without pairs.
 * @param {[string, string][]} pairs @returns {[number|null, number|null]}
 */
export function cohensKappa(pairs) {
  const n = pairs.length;
  if (!n) return [null, null];
  const observed = pairs.filter(([a, b]) => a === b).length / n;
  const categories = new Set(pairs.flat());
  let expected = 0;
  for (const c of categories) {
    expected += (pairs.filter(([a]) => a === c).length / n) * (pairs.filter(([, b]) => b === c).length / n);
  }
  return [observed, expected === 1 ? 1 : (observed - expected) / (1 - expected)];
}

export const STAGES = Object.freeze([
  { stage: "ta", label: "Title/abstract", decision: "ta_decision" },
  { stage: "ft", label: "Full text", decision: "ft_decision" },
]);

/**
 * Sampled records where both reviewers decided, and those where they differ.
 * @param {import("./records.js").ReviewRecord[]} records in record-id order
 * @param {"ta"|"ft"} stage
 */
export function comparison(records, stage) {
  const { decision } = STAGES.find(s => s.stage === stage);
  const pairs = [], disagreements = [];
  for (const r of records) {
    const mine = r.props[decision], theirs = r.props[`r2_${stage}_decision`];
    if (!(r.props[`sample_${stage}`] && ["include", "exclude", "unsure"].includes(mine) && theirs)) continue;
    pairs.push([mine, theirs]);
    if (mine !== theirs) disagreements.push({ record: r, mine, theirs, reason: r.props[`r2_${stage}_reason`] || "" });
  }
  const sampled = records.filter(r => r.props[`sample_${stage}`]).length;
  return { pairs, disagreements, sampled };
}
