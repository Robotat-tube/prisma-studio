/**
 * String helpers that behave exactly like their Python counterparts.
 *
 * Review folders are also written by the Python version of the tool, so every rule that touches text
 * (whitespace, line breaks, character counts) must give the same result in both languages. Keep all such
 * rules here instead of scattering look-alike regexes through the domain.
 * @module domain/pytext
 */

// Python's str.strip(), str.split() and "\s" in re treat these as whitespace (Unicode + \x1c-\x1f, \x85)
const WS = "\\s\\u001c-\\u001f\\u0085";
const EDGE_WS = new RegExp(`^[${WS}]+|[${WS}]+$`, "gu");
const RUN_WS = new RegExp(`[${WS}]+`, "gu");
const LINE_BREAKS = new RegExp("\r\n|[\n\r\v\f\u001c-\u001e\u0085  ]");
const PRINTABLE_EXCEPT = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;

/** str.strip() */
export const strip = s => String(s).replace(EDGE_WS, "");

/** str.split() without arguments */
export const splitWords = s => strip(s).split(RUN_WS).filter(Boolean);

/** re.sub(r"\s+", " ", s) */
export const collapseWhitespace = s => String(s).replace(RUN_WS, " ");

/** str.splitlines() */
export function splitLines(s) {
  const lines = String(s).split(LINE_BREAKS);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

/** Code points, as Python indexes and counts strings (JS counts UTF-16 units). */
export const chars = s => Array.from(String(s));

/** len(s) */
export const pyLen = s => chars(s).length;

/** Text as Python's open() reads it (universal newlines): CRLF and lone CR become LF. */
export const normalizeNewlines = s => String(s).replace(/\r\n?/g, "\n");

/** str.isprintable() for one character */
export const isPrintable = c => c === " " || !PRINTABLE_EXCEPT.test(c);

/** Escapes a string for use inside a RegExp. */
export const escapeRegExp = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
