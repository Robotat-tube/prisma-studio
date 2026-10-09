/**
 * CSV reading and writing in one fixed dialect (the format of `07 - Searches.csv`, the
 * second-reviewer sheets and database exports).
 * @module domain/csv
 */
import { splitLines } from "./text-rules.js";

/**
 * Parses CSV text into rows, like csv.reader(text.splitlines()): quoted fields may span lines,
 * "" inside quotes is a quote, blank lines are skipped.
 * @param {string} text
 * @param {{delimiter?: string, skipInitialSpace?: boolean}} [options]
 * @returns {string[][]}
 */
export function readRows(text, { delimiter = ",", skipInitialSpace = false } = {}) {
  const rows = [];
  let row = [], field = "", quoted = false, started = false;
  for (const line of splitLines(text)) {
    if (quoted) field += "\n";
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
        continue;
      }
      if (c === delimiter) { row.push(field); field = ""; started = false; continue; }
      if (!started && skipInitialSpace && c === " ") continue;
      if (!started && c === '"') { quoted = started = true; continue; }
      field += c;
      started = true;
    }
    if (quoted) continue;
    row.push(field);
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = []; field = ""; started = false;
  }
  if (quoted) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Rows as objects keyed by the header row, like csv.DictReader. Missing values are "".
 * @param {string} text
 * @param {{delimiter?: string}} [options]
 * @returns {Record<string, string>[]}
 */
export function readRecords(text, options) {
  const [head, ...rows] = readRows(text, options);
  if (!head) return [];
  return rows.map(r => Object.fromEntries(head.map((k, i) => [k, r[i] ?? ""])));
}

const needsQuotes = (v, delimiter) => v.includes(delimiter) || /["\r\n]/.test(v);
const cell = (v, delimiter) => {
  const s = v === null || v === undefined ? "" : String(v);
  return needsQuotes(s, delimiter) ? `"${s.replaceAll('"', '""')}"` : s;
};

/**
 * Writes rows like csv.writer (minimal quoting, CRLF line ends).
 * @param {unknown[][]} rows
 * @param {{delimiter?: string}} [options]
 * @returns {string}
 */
export const writeRows = (rows, { delimiter = "," } = {}) =>
  rows.map(r => r.map(v => cell(v, delimiter)).join(delimiter) + "\r\n").join("");

/**
 * Writes objects like csv.DictWriter with a header row.
 * @param {string[]} columns
 * @param {Record<string, unknown>[]} records
 */
export const writeRecords = (columns, records) =>
  writeRows([columns, ...records.map(r => columns.map(c => r[c] ?? ""))]);
