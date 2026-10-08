/**
 * The properties block ("front matter") at the top of every note, in the subset of YAML that the tool
 * writes and Obsidian edits: scalars, quoted strings, inline lists `[a, b]` and block lists `- a`.
 * @module domain/frontmatter
 */
import { readRows } from "./csv.js";
import { escapeRegExp, splitLines, strip } from "./pytext.js";

const BLOCK = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$(?![\s\S]))/;

/** @typedef {string | number | bigint | boolean | Scalar[]} Scalar */
/** @typedef {Record<string, Scalar>} Properties */

/** One YAML scalar as written by the tool or typed in Obsidian. */
export function parseScalar(raw) {
  const v = strip(raw);
  if (v === "" || v === "null" || v === "~") return "";
  if (v.length >= 2 && v[0] === '"' && v.at(-1) === '"') {
    try { return JSON.parse(v); } catch { return v.slice(1, -1); }
  }
  if (v.length >= 2 && v[0] === "'" && v.at(-1) === "'") return v.slice(1, -1).replaceAll("''", "'");
  if (v === "true" || v === "false") return v === "true";
  if (/^-?\d+$/.test(v)) return Number.isSafeInteger(Number(v)) ? Number(v) : BigInt(v);
  return v;
}

/**
 * Splits a note into its properties and the text after them.
 * @param {string} text note text with "\n" line ends (see pytext.normalizeNewlines)
 * @returns {[Properties, string]}
 */
export function parse(text) {
  const m = BLOCK.exec(text);
  if (!m) return [{}, text];
  /** @type {Properties} */
  const data = {};
  let key = null;
  for (const line of splitLines(m[1])) {
    const s = strip(line);
    if (!s) continue;
    if (key !== null && (" \t".includes(line[0]) || s.startsWith("-"))) {
      if (s === "-" || s.startsWith("- ")) {
        if (!Array.isArray(data[key])) data[key] = [];
        data[key].push(parseScalar(s.slice(1)));
      }
      continue;
    }
    const colon = line.indexOf(":");
    key = strip(colon < 0 ? line : line.slice(0, colon));
    const value = strip(colon < 0 ? "" : line.slice(colon + 1));
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = strip(value.slice(1, -1));
      data[key] = inner ? (readRows(inner, { skipInitialSpace: true })[0] ?? [""]).map(parseScalar) : [];
    } else data[key] = parseScalar(value);
  }
  return [data, text.slice(m.index + m[0].length)];
}

/** One value as the tool writes it: strings always double-quoted (JSON escaping). */
export function formatValue(v) {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "bigint" || (typeof v === "number" && Number.isInteger(v))) return String(v);
  if (v === null || v === undefined || v === "") return '""';
  return JSON.stringify(String(v));
}

const listLines = (key, values) => [`${key}:` + (values.length ? "" : " []"), ...values.map(x => `  - ${formatValue(x)}`)];

/** Properties as a front-matter block, in their insertion order. */
export function serialize(/** @type {Properties} */ data) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) lines.push(...listLines(k, v));
    else lines.push(`${k}: ${formatValue(v)}`);
  }
  lines.push("---");
  return lines.join("\n") + "\n";
}

/**
 * Replaces one list property in a note, leaving every other line untouched (safe for notes the user
 * edits by hand, such as publication notes).
 */
export function replaceList(text, key, values) {
  const m = BLOCK.exec(text);
  if (!m) return text;
  const lines = splitLines(m[1]);
  const head = new RegExp(`^${escapeRegExp(key)}\\s*:`);
  const out = [];
  let replaced = false;
  for (let i = 0; i < lines.length; i++) {
    if (!head.test(lines[i])) { out.push(lines[i]); continue; }
    while (i + 1 < lines.length && lines[i + 1] && (" \t".includes(lines[i + 1][0]) || lines[i + 1].trimStart().startsWith("-"))) i++;
    out.push(...listLines(key, values));
    replaced = true;
  }
  if (!replaced) out.push(...listLines(key, values));
  return "---\n" + out.join("\n") + "\n---\n" + text.slice(m.index + m[0].length);
}
