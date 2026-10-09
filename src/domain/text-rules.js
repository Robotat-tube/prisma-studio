/**
 * Text rules used everywhere a note or table is written: whitespace, line breaks, character counting, sorting.
 *
 * Every rule that touches text (whitespace, line breaks, character counts) must give the same result
 * wherever a review is written, so the folder format stays stable. Keep all such rules here instead of scattering look-alike regexes through the domain.
 * @module domain/text-rules
 */

// Whitespace for strip(), splitWords() and RUN_WS (Unicode + \x1c-\x1f, \x85)
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

/** Code points (JS counts UTF-16 units). */
export const chars = s => Array.from(String(s));

/** len(s) */
export const charCount = s => chars(s).length;

/** Text with universal newlines: CRLF and lone CR become LF. */
export const normalizeNewlines = s => String(s).replace(/\r\n?/g, "\n");

/** str.isprintable() for one character */
export const isPrintable = c => c === " " || !PRINTABLE_EXCEPT.test(c);

/**
 * format(x, f".{digits}f"): rounds the exact binary value of x, ties to even (JS toFixed rounds ties up).
 * @param {number} x @param {number} digits
 */
export function formatFixed(x, digits) {
  if (!Number.isFinite(x)) return String(x);
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const negative = bits >> 63n === 1n;
  const exp = Number((bits >> 52n) & 0x7ffn);
  let mantissa = bits & 0xfffffffffffffn;
  let e;
  if (exp === 0) e = -1074;
  else { mantissa |= 1n << 52n; e = exp - 1075; }
  // |x| = mantissa · 2^e; scaled = |x| · 10^digits, rounded half to even
  let num = mantissa * 10n ** BigInt(digits), den = 1n;
  if (e >= 0) num <<= BigInt(e); else den <<= BigInt(-e);
  let q = num / den;
  const twice = 2n * (num % den);
  if (twice > den || (twice === den && q % 2n === 1n)) q++;
  let s = q.toString().padStart(digits + 1, "0");
  if (digits) s = s.slice(0, -digits) + "." + s.slice(-digits);
  return (negative ? "-" : "") + s;              // the sign of -0.0 is kept too
}

/** format(x, ".0%") */
export const formatPercent = x => formatFixed(x * 100, 0) + "%";

/** String order by code point; JS sorts by UTF-16 units. */
export function compareCodePoints(a, b) {
  // fast path: UTF-16 order equals code-point order up to the first difference, unless a surrogate is involved there
  a = String(a); b = String(b);
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  if (i === n) return a.length - b.length;
  const u = a.charCodeAt(i), v = b.charCodeAt(i);
  if ((u < 0xd800 || u > 0xdfff) && (v < 0xd800 || v > 0xdfff)) return u - v;
  const x = chars(a), y = chars(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i].codePointAt(0) - y[i].codePointAt(0);
  }
  return x.length - y.length;
}

/** Escapes a string for use inside a RegExp. */
export const escapeRegExp = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
