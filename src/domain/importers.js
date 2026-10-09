/**
 * Reading database exports (RIS, BibTeX, CSV/TSV from Scopus, Web of Science, IEEE Xplore…) into
 * uniform entries.
 * @module domain/importers
 */
import { readRows } from "./csv.js";
import { normalizeDoi, yearOf } from "./matching.js";
import { collapseWhitespace, splitLines, strip } from "./text-rules.js";

/**
 * @typedef {object} Entry  one paper as found in an export
 * @property {string} title @property {string} authors "Surname, I.; …" @property {number|""} year
 * @property {string} journal @property {string} doi @property {string} url @property {string} abstract
 * @property {string} language @property {string} keywords
 */

/** @returns {Entry} */
export function makeEntry({ title = "", authors = "", year = "", journal = "", doi = "", url = "", abstract = "", language = "", keywords = "" } = {}) {
  return {
    title: strip(collapseWhitespace(title)), authors: strip(authors), year: yearOf(year), journal: strip(journal),
    doi: normalizeDoi(doi), url: strip(url), abstract: strip(abstract), language: strip(language), keywords: strip(keywords),
  };
}

/** @returns {Entry[]} */
export function parseRis(text) {
  const records = [];
  let current = {}, lastTag = null;
  for (const line of splitLines(text)) {
    const m = /^([A-Z][A-Z0-9])  -\s?(.*)$/.exec(line);
    if (!m) {
      if (lastTag && strip(line)) current[lastTag][current[lastTag].length - 1] += " " + strip(line);
      continue;
    }
    const [, tag, value] = m;
    if (tag === "ER") { records.push(current); current = {}; lastTag = null; continue; }
    (current[tag] ??= []).push(strip(value));
    lastTag = tag;
  }
  if (Object.keys(current).length) records.push(current);
  const first = (r, ...tags) => tags.map(t => r[t]?.[0]).find(v => v !== undefined) ?? "";
  return records.map(r => makeEntry({
    title: first(r, "TI", "T1"), authors: [...(r.AU ?? []), ...(r.A1 ?? [])].join("; "), year: first(r, "PY", "Y1", "DA"),
    journal: first(r, "T2", "JO", "JF", "JA", "BT"), doi: first(r, "DO"), url: first(r, "UR"), abstract: first(r, "AB", "N2"),
    language: (r.LA ?? []).join("; "), keywords: (r.KW ?? []).join("; "),
  }));
}

/** Reads `name = {…}`, `name = "…"` and `name = bare` fields of one BibTeX entry body. */
function bibFields(body) {
  const fields = {};
  const fieldStart = /\s*,?\s*([\w-]+)\s*=\s*/y, bare = /[^,]*/y;
  let pos = body.indexOf(",") + 1;
  while (pos && pos < body.length) {
    fieldStart.lastIndex = pos;
    const m = fieldStart.exec(body);
    if (!m) break;
    pos = fieldStart.lastIndex;
    let value;
    if (body[pos] === "{") {
      const start = pos;
      for (let depth = 0; pos < body.length;) { depth += (body[pos] === "{") - (body[pos] === "}"); pos++; if (!depth) break; }
      value = body.slice(start + 1, pos - 1);
    } else if (body[pos] === '"') {
      let end = pos + 1;
      while (end < body.length && !(body[end] === '"' && body[end - 1] !== "\\")) end++;
      value = body.slice(pos + 1, end);
      pos = end + 1;
    } else {
      bare.lastIndex = pos;
      value = bare.exec(body)[0];
      pos = bare.lastIndex;
    }
    fields[m[1].toLowerCase()] = strip(collapseWhitespace(value.replaceAll("{", "").replaceAll("}", "")));
  }
  return fields;
}

/** @returns {Entry[]} */
export function parseBibtex(text) {
  const out = [];
  for (const m of text.matchAll(/@(\w+)\s*\{/g)) {
    if (["comment", "string", "preamble"].includes(m[1].toLowerCase())) continue;
    let end = m.index + m[0].length;
    for (let depth = 1; end < text.length && depth; end++) depth += text[end] === "{" ? 1 : text[end] === "}" ? -1 : 0;
    const f = bibFields(text.slice(m.index + m[0].length, end - 1));
    out.push(makeEntry({
      title: f.title, authors: (f.author ?? "").split(" and ").map(strip).join("; "), year: f.year,
      journal: f.journal || f.booktitle, doi: f.doi, url: f.url, abstract: f.abstract,
    }));
  }
  return out;
}

const CSV_COLUMNS = {
  title: ["title", "document title", "article title", "ti"],
  authors: ["authors", "author", "author full names", "au"],
  year: ["year", "publication year", "py"],
  journal: ["source title", "publication title", "journal", "so"],
  doi: ["doi", "di"],
  url: ["link", "url", "pdf link"],
  abstract: ["abstract", "ab"],
};

/** CSV or tab-separated export; columns recognised by their usual names in each database. @returns {Entry[]} */
export function parseCsv(text) {
  const firstLine = splitLines(text)[0] ?? "";
  const [head, ...rows] = readRows(text, { delimiter: firstLine.includes("\t") ? "\t" : "," });
  if (!head) return [];
  const columns = head.map(h => strip(h).toLowerCase());
  return rows.map(r => {
    const byName = {};
    columns.forEach((c, i) => { byName[c] = r[i] ?? ""; });
    const pick = Object.fromEntries(Object.entries(CSV_COLUMNS).map(([f, names]) => [f, names.map(n => byName[n]).find(Boolean) ?? ""]));
    return makeEntry(pick);
  });
}

/**
 * Any supported export, recognised by extension or content.
 * @param {string} fileName @param {string} text @returns {Entry[]}
 */
export function parseExport(fileName, text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const ext = (/\.[^.]+$/.exec(fileName)?.[0] ?? "").toLowerCase();
  if (ext === ".ris" || ext === ".nbib" || /^TY  -/m.test(text)) return parseRis(text);
  if (ext === ".bib" || text.trimStart().startsWith("@")) return parseBibtex(text);
  return parseCsv(text);
}
