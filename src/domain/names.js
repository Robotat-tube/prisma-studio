/**
 * How papers are named: authors as cited and record file names (`R0001 - 2024 - Liu et al. - Title`).
 * @module domain/names
 */
import { chars, collapseWhitespace, isPrintable, splitWords, strip } from "./text-rules.js";

const isPrivateUse = c => c.codePointAt(0) >= 0xe000 && c.codePointAt(0) <= 0xf8ff;   // e.g. U+F020 in exports
const keepInName = c => " ,'’.-".includes(c) || /[\p{L}\p{M}\p{N}]/u.test(c);

/** Removes markers such as "Nakashima *" and turns every dash into "-". */
const cleanAuthor = a => strip(chars(a.replace(/\p{Pd}/gu, "-")).filter(keepInName).join(""));

/** "Liu" (one author), "Baldwin & Clark" (two), "Liu et al." (three or more), from "Surname, I.; …". */
export function citedAuthors(authors) {
  const names = String(authors ?? "").split(";").map(strip).filter(Boolean).map(cleanAuthor).filter(Boolean);
  const surnames = names.map(a => a.includes(",") ? strip(a.split(",")[0]) : (splitWords(a).at(-1) ?? "Anon"));
  if (!surnames.length) return "Anon";
  if (surnames.length === 1) return surnames[0];
  return surnames.length === 2 ? `${surnames[0]} & ${surnames[1]}` : `${surnames[0]} et al.`;
}

/** Record note name: `R0001 - 2024 - Liu et al. - Title` with the title cut to 70 characters. */
export function recordName(recordId, authors, year, title) {
  const raw = `${recordId} - ${year || "n.d."} - ${citedAuthors(authors)} - ${chars(title ?? "").slice(0, 70).join("")}`;
  const printable = chars(raw).filter(c => isPrintable(c) && !isPrivateUse(c)).join("");
  return strip(collapseWhitespace(printable.replace(/[\\/:*?"<>|#^[\]]+/g, "")));
}
