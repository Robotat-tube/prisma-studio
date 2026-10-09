/**
 * Screening rules: which property values are allowed, which follow automatically (a title/abstract
 * include opens the full-text stage, a decision sets the screening date), and what is a problem to fix.
 * @module domain/screening
 */
import { splitWords, strip } from "./text-rules.js";
import { FT_DECISIONS, PDF_STATUSES, SECOND_REVIEWER_DECISIONS, TA_DECISIONS } from "./vocabulary.js";

const NORMALISED = ["ta_decision", "ft_decision", "pdf_status", "r2_ta_decision", "r2_ft_decision"];

/** A reason counts when it equals an allowed reason or starts with its code ("E2", "E2 wrong context"). */
export function isValidReason(reason, allowed) {
  if (!reason) return false;
  const code = splitWords(reason)[0];
  return allowed.includes(reason) || (code !== undefined && codesOf(allowed).has(code));
}

const CODES = new WeakMap();   // allowed list → its codes (the list is checked once per record)
function codesOf(allowed) {
  if (!CODES.has(allowed)) CODES.set(allowed, new Set(allowed.map(a => splitWords(a)[0]).filter(c => c !== undefined)));
  return CODES.get(allowed);
}

/**
 * Checks one record and fills what follows from its decisions.
 * @param {import("./frontmatter.js").Properties} props
 * @param {{ta: readonly string[], ft: readonly string[]}} reasons allowed exclusion reasons
 * @param {string} today ISO date for screened_on
 * @returns {{props: import("./frontmatter.js").Properties, problems: string[], changed: boolean}}
 */
export function checkRecord(props, reasons, today) {
  const p = { ...props };
  for (const k of NORMALISED) if (typeof p[k] === "string") p[k] = strip(p[k]).toLowerCase();
  const problems = [];
  const ta = p.ta_decision ?? "", ft = p.ft_decision ?? "";
  if (!TA_DECISIONS.includes(ta)) problems.push(`ta_decision "${ta}" is not one of ${TA_DECISIONS.join(", ")}`);
  if (!FT_DECISIONS.includes(ft)) problems.push(`ft_decision "${ft}" is not one of ${FT_DECISIONS.filter(Boolean).join(", ")}`);
  if (!PDF_STATUSES.includes(p.pdf_status ?? "")) problems.push(`pdf_status "${p.pdf_status}" is not found / not-retrieved`);
  for (const k of ["r2_ta_decision", "r2_ft_decision"]) {
    if (!SECOND_REVIEWER_DECISIONS.includes(p[k] ?? "")) problems.push(`${k} "${p[k]}" is not include / exclude / unsure`);
  }
  if ((ta === "include" || ta === "unsure") && ft === "") p.ft_decision = "pending";
  if ((ta === "pending" || ta === "exclude") && ft === "pending") p.ft_decision = "";
  if (ta === "exclude" && !isValidReason(p.ta_reason ?? "", reasons.ta)) problems.push("excluded at title/abstract without a reason from the Screening guide");
  if (ft === "exclude" && !isValidReason(p.ft_reason ?? "", reasons.ft)) problems.push("excluded at full text without a reason from the Screening guide");
  if ((ft === "include" || ft === "exclude") && p.pdf_status === "not-retrieved") problems.push("full-text decision recorded but pdf_status is not-retrieved");
  if ((ta !== "pending" || ft === "include" || ft === "exclude") && !p.screened_on) p.screened_on = today;
  const changed = Object.keys(p).length !== Object.keys(props).length || Object.keys(p).some(k => p[k] !== props[k]);
  return { props: p, problems, changed };
}
