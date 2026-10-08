/**
 * Search strings built from the concept table: one block of synonyms per concept (OR inside a block, AND
 * between blocks, NOT blocks excluded), in each database's syntax. A string edited by hand wins.
 * @module domain/queries
 */
import { splitWords, strip } from "./pytext.js";

/** Terms typed one per line or separated by ";". */
export const cleanTerms = text => String(text).split(/[\n;]+/).map(strip).filter(Boolean);

/**
 * OpenAlex has no wildcards but stems every word (repair = repairable = repairability), so a truncated
 * stem becomes a full word: repairab* → repairability, disassembl* → disassembly, scor* → score.
 */
export function openalexWord(term) {
  return splitWords(String(term).replaceAll("?", "")).map(word => {
    if (!word.endsWith("*")) return word;
    const w = word.slice(0, -1);
    if (w.endsWith("ab") || w.endsWith("ib")) return w + "ility";
    if (w.endsWith("bl")) return w + "y";
    if ((w.endsWith("or") || w.endsWith("ur")) && [...w].length <= 5) return w + "e";
    return w;
  }).join(" ");
}

/** One term in a database's syntax: phrases quoted, IEEE fields named. */
export function formatTerm(term, database) {
  let t = strip(term);
  if (database === "OpenAlex") t = openalexWord(t);
  if (t.includes(" ") && !(t.startsWith('"') && t.endsWith('"'))) t = `"${t}"`;
  return database === "IEEE Xplore" ? `"All Metadata":${t}` : t;
}

/** The AND blocks and NOT blocks of the concept table. @returns {[string[], string[]]} */
export function blocks(concepts, database) {
  const ands = [], nots = [];
  for (const c of concepts) {
    const terms = (c.terms ?? []).filter(t => strip(t)).map(t => formatTerm(t, database));
    if (!terms.length) continue;
    (c.role === "NOT" ? nots : ands).push("(" + terms.join(" OR ") + ")");
  }
  return [ands, nots];
}

/** OpenAlex title/abstract search ("NOT" without AND). */
export function openalexQuery(st) {
  if (st.queries.manual.OpenAlex) return st.queries.manual.OpenAlex;
  const [ands, nots] = blocks(st.concepts, "OpenAlex");
  return ands.join(" AND ") + nots.map(n => ` NOT ${n}`).join("");
}

/** The search string for one database. */
export function buildQuery(st, database) {
  if (database === "OpenAlex") return openalexQuery(st);
  if (st.queries.manual[database]) return st.queries.manual[database];
  const [ands, nots] = blocks(st.concepts, database);
  if (!ands.length) return "";
  const core = ands.join(" AND ") + nots.map(n => ` AND NOT ${n}`).join("");
  if (database === "Scopus") return `TITLE-ABS-KEY(${core})`;
  if (database === "Web of Science") return `TS=(${core})`;
  return core;
}
