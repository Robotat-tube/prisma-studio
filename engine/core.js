// Core of the review engine: note front matter, record names, matching (DOI, titles, duplicates) and
// import parsers (RIS, BibTeX, CSV). A faithful port of the same functions in the Python version
// (prisma_review.py); tests/core.test.js compares both on a real review folder.

export const TA_VALUES = ["pending", "include", "exclude", "unsure"];
export const FT_VALUES = ["", "pending", "include", "exclude"];
export const PDF_VALUES = ["", "found", "not-retrieved"];
export const R2_VALUES = ["", "include", "exclude", "unsure"];

export const DEFAULT_TA_REASONS = [
  "E1 wrong concept",
  "E2 wrong context",
  "E3 wrong publication type",
  "E4 language",
  "E5 outside date range",
];
export const DEFAULT_FT_REASONS = [...DEFAULT_TA_REASONS, "E6 no usable content on the concept"];

const chars = s => Array.from(String(s));          // code points, as Python indexes strings
// Python's str.split() without arguments, str.strip() and "\s" in re all use Unicode whitespace
const WS = "\\s\\u001c-\\u001f\\u0085";
const STRIP = new RegExp(`^[${WS}]+|[${WS}]+$`, "gu");
const pyStrip = s => String(s).replace(STRIP, "");
const pySplit = s => pyStrip(s).split(new RegExp(`[${WS}]+`, "u")).filter(Boolean);

// ---------------------------------------------------------------- front matter

// Text as Python reads it (universal newlines): CRLF and lone CR become LF. Notes are written with LF.
export const readText = text => String(text).replace(/\r\n?/g, "\n");

const FM = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$(?![\s\S]))/;

export function parseScalar(v) {
  v = pyStrip(v);
  if (v === "" || v === "null" || v === "~") return "";
  if (v.length >= 2 && v[0] === '"' && v.at(-1) === '"') {
    try { return JSON.parse(v); } catch { return v.slice(1, -1); }
  }
  if (v.length >= 2 && v[0] === "'" && v.at(-1) === "'") return v.slice(1, -1).replaceAll("''", "'");
  if (v === "true" || v === "false") return v === "true";
  if (/^-?\d+$/.test(v)) return Number.isSafeInteger(Number(v)) ? Number(v) : BigInt(v);
  return v;
}

// One row of Python's csv.reader(skipinitialspace=True): commas split, double quotes group, "" escapes.
function csvRow(s) {
  const out = [];
  let i = 0, field = "", quoted = false, start = true;
  while (i <= s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { quoted = false; i++; continue; }
      if (c === undefined) break;
      field += c; i++; continue;
    }
    if (c === undefined || c === ",") { out.push(field); field = ""; start = true; i++; continue; }
    if (start && c === " ") { i++; continue; }
    if (start && c === '"') { quoted = true; start = false; i++; continue; }
    start = false; field += c; i++;
  }
  return out;
}

// Python's str.splitlines()
const LINE_BREAKS = new RegExp("\r\n|[\n\r\v\f\u001c-\u001e\u0085\u2028\u2029]");
const splitLines = s => { const l = String(s).split(LINE_BREAKS); if (l.at(-1) === "") l.pop(); return l; };

export function readFm(text) {
  const m = FM.exec(text);
  if (!m) return [{}, text];
  const data = {};
  let key = null;
  for (const line of splitLines(m[1])) {
    if (!pyStrip(line)) continue;
    const s = pyStrip(line);
    if (key !== null && (" \t".includes(line[0]) || s.startsWith("-"))) {
      if (s === "-" || s.startsWith("- ")) {
        if (!Array.isArray(data[key])) data[key] = [];
        data[key].push(parseScalar(s.slice(1)));
      }
      continue;
    }
    const i = line.indexOf(":");
    const k = i < 0 ? line : line.slice(0, i), v = i < 0 ? "" : line.slice(i + 1);
    key = pyStrip(k);
    const vv = pyStrip(v);
    if (vv.startsWith("[") && vv.endsWith("]")) {
      const inner = pyStrip(vv.slice(1, -1));
      data[key] = inner ? csvRow(inner).map(parseScalar) : [];
    } else data[key] = parseScalar(vv);
  }
  return [data, text.slice(m.index + m[0].length)];
}

// json.dumps(str, ensure_ascii=False) escapes the same characters as JSON.stringify
const pyJson = s => JSON.stringify(s);

export function dumpValue(v) {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number" && Number.isInteger(v)) return String(v);
  if (typeof v === "bigint") return String(v);
  if (v === null || v === undefined || v === "") return '""';
  return pyJson(String(v));
}

export function dumpFm(data) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:` + (v.length ? "" : " []"));
      for (const x of v) lines.push(`  - ${dumpValue(x)}`);
    } else lines.push(`${k}: ${dumpValue(v)}`);
  }
  lines.push("---");
  return lines.join("\n") + "\n";
}

const reEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function setListKey(text, key, values) {
  const m = FM.exec(text);
  if (!m) return text;
  const lines = splitLines(m[1]);
  const block = [`${key}:` + (values.length ? "" : " []"), ...values.map(x => `  - ${dumpValue(x)}`)];
  const out = [];
  let i = 0, done = false;
  const head = new RegExp(`^${reEscape(key)}\\s*:`);
  while (i < lines.length) {
    if (head.test(lines[i])) {
      i++;
      while (i < lines.length && lines[i] && (" \t".includes(lines[i][0]) || lines[i].trimStart().startsWith("-"))) i++;
      out.push(...block);
      done = true;
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  if (!done) out.push(...block);
  return "---\n" + out.join("\n") + "\n---\n" + text.slice(m.index + m[0].length);
}

// ---------------------------------------------------------------- names

export function citedAuthors(authors) {
  const clean = a => {
    a = a.replace(/\p{Pd}/gu, "-");
    return pyStrip(Array.from(a).filter(c => " ,'’.-".includes(c) || /[\p{L}\p{M}\p{N}]/u.test(c)).join(""));
  };
  const names = String(authors ?? "").split(";").map(pyStrip).filter(Boolean).map(clean);
  let sur = names.filter(Boolean).map(a => a.includes(",") ? pyStrip(a.split(",")[0]) : (pySplit(a).at(-1) ?? "Anon"));
  if (!sur.length) sur = ["Anon"];
  return sur.length === 1 ? sur[0] : sur.length === 2 ? `${sur[0]} & ${sur[1]}` : `${sur[0]} et al.`;
}

// Python's str.isprintable(): not in Cc, Cf, Cs, Co, Cn, Zl, Zp, and Zs other than the plain space
const unprintable = c => c !== " " && /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u.test(c);

export function recordName(rid, authors, year, title) {
  let name = `${rid} - ${year || "n.d."} - ${citedAuthors(authors)} - ${chars(title ?? "").slice(0, 70).join("")}`;
  name = Array.from(name).filter(c => !unprintable(c) && !(c.codePointAt(0) >= 0xe000 && c.codePointAt(0) <= 0xf8ff)).join("");
  return pyStrip(name.replace(/[\\/:*?"<>|#^[\]]+/g, "").replace(new RegExp(`[${WS}]+`, "gu"), " "));
}

// ---------------------------------------------------------------- matching

export function normDoi(d) {
  d = pyStrip(String(d ?? "")).toLowerCase();
  d = d.replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/, "");
  return d.replace(/\.+$/, "");
}

export function normTitle(t) {
  t = String(t ?? "").normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase();
  return pyStrip(t.replace(/[^a-z0-9]+/g, " "));
}

export function yearOf(v) {
  const m = /(1[89]|20)\d\d/.exec(String(v ?? ""));
  return m ? Number(m[0]) : "";
}

// difflib.SequenceMatcher(None, a, b).ratio() — no junk; autojunk only affects sequences of 200+ items
export function ratio(a, b) {
  a = chars(a); b = chars(b);
  const b2j = new Map();
  b.forEach((c, j) => { if (!b2j.has(c)) b2j.set(c, []); b2j.get(c).push(j); });
  if (b.length >= 200) {                         // difflib's "popular" heuristic
    const ntest = Math.floor(b.length / 100) + 1;
    for (const [c, idx] of [...b2j]) if (idx.length > ntest) b2j.delete(c);
  }
  const longest = (alo, ahi, blo, bhi) => {
    let besti = alo, bestj = blo, bestsize = 0, j2len = new Map();
    for (let i = alo; i < ahi; i++) {
      const next = new Map();
      for (const j of b2j.get(a[i]) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        next.set(j, k);
        if (k > bestsize) { besti = i - k + 1; bestj = j - k + 1; bestsize = k; }
      }
      j2len = next;
    }
    // extend across elements left out of b2j as "popular" (they are not junk), as difflib does
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) { besti--; bestj--; bestsize++; }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) bestsize++;
    return [besti, bestj, bestsize];
  };
  let matches = 0;
  const queue = [[0, a.length, 0, b.length]];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop();
    const [i, j, k] = longest(alo, ahi, blo, bhi);
    if (k) {
      matches += k;
      if (alo < i && blo < j) queue.push([alo, i, blo, j]);
      if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
    }
  }
  const total = a.length + b.length;
  return total ? 2 * matches / total : 1;
}

// Finds an existing entry by DOI, then exact title (year ±1), then near-identical title (same year).
export class Index {
  constructor() { this.doi = new Map(); this.title = new Map(); this.byYear = new Map(); }

  add(key, doi, title, year) {
    const d = normDoi(doi), t = normTitle(title);
    if (d && !this.doi.has(d)) this.doi.set(d, key);
    if (t) {
      if (!this.title.has(t)) this.title.set(t, []);
      this.title.get(t).push([year, key]);
      if (!this.byYear.has(year)) this.byYear.set(year, []);
      this.byYear.get(year).push([t, key]);
    }
  }

  find(doi, title, year) {
    const d = normDoi(doi), t = normTitle(title);
    if (d && this.doi.has(d)) return this.doi.get(d);
    if (!t) return null;
    for (const [y, key] of this.title.get(t) ?? []) if (!year || !y || Math.abs(year - y) <= 1) return key;
    if (chars(t).length > 25 && year) {
      for (const [tt, key] of this.byYear.get(year) ?? []) if (ratio(t, tt) >= 0.93) return key;
    }
    return null;
  }
}

// ---------------------------------------------------------------- import parsers

export function entry({ title = "", authors = "", year = "", journal = "", doi = "", url = "", abstract = "", language = "", keywords = "" } = {}) {
  return {
    title: pyStrip(title.replace(new RegExp(`[${WS}]+`, "gu"), " ")), authors: pyStrip(authors), year: yearOf(year),
    journal: pyStrip(journal), doi: normDoi(doi), url: pyStrip(url), abstract: pyStrip(abstract),
    language: pyStrip(language), keywords: pyStrip(keywords),
  };
}

export function parseRis(text) {
  const recs = [];
  let cur = {}, last = null;
  for (const line of splitLines(text)) {
    const m = /^([A-Z][A-Z0-9])  -\s?(.*)$/.exec(line);
    if (!m) {
      if (last && pyStrip(line)) cur[last][cur[last].length - 1] += " " + pyStrip(line);
      continue;
    }
    const tag = m[1], val = pyStrip(m[2]);
    if (tag === "ER") { recs.push(cur); cur = {}; last = null; continue; }
    (cur[tag] ??= []).push(val);
    last = tag;
  }
  if (Object.keys(cur).length) recs.push(cur);
  const g = (r, ...tags) => { for (const t of tags) if (r[t]?.length) return r[t][0]; return ""; };
  return recs.map(r => entry({
    title: g(r, "TI", "T1"), authors: [...(r.AU ?? []), ...(r.A1 ?? [])].join("; "), year: g(r, "PY", "Y1", "DA"),
    journal: g(r, "T2", "JO", "JF", "JA", "BT"), doi: g(r, "DO"), url: g(r, "UR"), abstract: g(r, "AB", "N2"),
    language: (r.LA ?? []).join("; "), keywords: (r.KW ?? []).join("; "),
  }));
}

export function parseBib(text) {
  const out = [];
  for (const m of text.matchAll(/@(\w+)\s*\{/g)) {
    if (["comment", "string", "preamble"].includes(m[1].toLowerCase())) continue;
    const i = m.index + m[0].length;
    let depth = 1, j = i;
    while (j < text.length && depth) { depth += text[j] === "{" ? 1 : text[j] === "}" ? -1 : 0; j++; }
    const body = text.slice(i, j - 1);
    const fields = {};
    let pos = body.indexOf(",") + 1;
    const fieldRe = /\s*,?\s*([\w-]+)\s*=\s*/y, bareRe = /[^,]*/y;
    while (pos && pos < body.length) {
      fieldRe.lastIndex = pos;
      const fm = fieldRe.exec(body);
      if (!fm) break;
      const name = fm[1].toLowerCase();
      pos = fieldRe.lastIndex;
      let val;
      if (pos < body.length && body[pos] === "{") {
        const start = pos;
        let d = 0;
        while (pos < body.length) { d += (body[pos] === "{") - (body[pos] === "}"); pos++; if (d === 0) break; }
        val = body.slice(start + 1, pos - 1);
      } else if (pos < body.length && body[pos] === '"') {
        let end = pos + 1;
        while (end < body.length && !(body[end] === '"' && body[end - 1] !== "\\")) end++;
        val = body.slice(pos + 1, end);
        pos = end + 1;
      } else {
        bareRe.lastIndex = pos;
        const bm = bareRe.exec(body);
        val = bm[0];
        pos = bareRe.lastIndex;
      }
      fields[name] = pyStrip(val.replaceAll("{", "").replaceAll("}", "").replace(new RegExp(`[${WS}]+`, "gu"), " "));
    }
    out.push(entry({
      title: fields.title ?? "", authors: (fields.author ?? "").split(" and ").map(pyStrip).join("; "),
      year: fields.year ?? "", journal: fields.journal || (fields.booktitle ?? ""), doi: fields.doi ?? "",
      url: fields.url ?? "", abstract: fields.abstract ?? "",
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

// Python's csv module over a list of lines (as csv.DictReader(text.splitlines())): quoted fields may span lines
function csvRecords(lines, delim) {
  const rows = [];
  let row = [], field = "", quoted = false, started = false;
  for (const line of lines) {
    let i = 0;
    if (quoted) field += "\n";
    while (i < line.length) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') { field += '"'; i += 2; continue; }
        if (c === '"') { quoted = false; i++; continue; }
        field += c; i++; continue;
      }
      if (c === delim) { row.push(field); field = ""; started = false; i++; continue; }
      if (c === '"' && !started) { quoted = true; started = true; i++; continue; }
      field += c; started = true; i++;
    }
    if (quoted) continue;
    row.push(field);
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = []; field = ""; started = false;
  }
  if (quoted || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function parseCsv(text) {
  const lines = splitLines(text);
  const first = text ? (lines[0] ?? "") : "";
  const [head, ...rows] = csvRecords(lines, first.includes("\t") ? "\t" : ",");
  if (!head) return [];
  return rows.map(r => {
    const low = {};
    head.forEach((k, i) => { const key = pyStrip(k ?? "").toLowerCase(); if (!(key in low) || true) low[key] = r[i] ?? ""; });
    // DictReader puts extra values under None; missing ones become None → ""
    const pick = {};
    for (const [f, cols] of Object.entries(CSV_COLUMNS)) pick[f] = cols.map(c => low[c]).find(v => v) ?? "";
    return entry(pick);
  });
}

export function parseFile(name, text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);   // utf-8-sig
  const ext = (/\.[^.]+$/.exec(name)?.[0] ?? "").toLowerCase();
  if (ext === ".ris" || ext === ".nbib" || /^TY  -/m.test(text)) return parseRis(text);
  if (ext === ".bib" || text.trimStart().startsWith("@")) return parseBib(text);
  return parseCsv(text);
}
