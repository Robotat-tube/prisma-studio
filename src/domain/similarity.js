/**
 * Title similarity, identical to Python's difflib.SequenceMatcher(None, a, b).ratio() so that the
 * duplicate finder gives the same answers as the Python version.
 * @module domain/similarity
 */
import { chars } from "./pytext.js";

/** Positions of each character in b, minus "popular" characters in long strings (difflib's autojunk). */
function index(b) {
  const positions = new Map();
  b.forEach((c, j) => { if (!positions.has(c)) positions.set(c, []); positions.get(c).push(j); });
  if (b.length >= 200) {
    const limit = Math.floor(b.length / 100) + 1;
    for (const [c, js] of [...positions]) if (js.length > limit) positions.delete(c);
  }
  return positions;
}

/** difflib's find_longest_match without junk; extends across popular characters as difflib does. */
function longestMatch(a, b, positions, alo, ahi, blo, bhi) {
  let besti = alo, bestj = blo, size = 0, lengths = new Map();
  for (let i = alo; i < ahi; i++) {
    const next = new Map();
    for (const j of positions.get(a[i]) ?? []) {
      if (j < blo) continue;
      if (j >= bhi) break;
      const k = (lengths.get(j - 1) ?? 0) + 1;
      next.set(j, k);
      if (k > size) { besti = i - k + 1; bestj = j - k + 1; size = k; }
    }
    lengths = next;
  }
  while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) { besti--; bestj--; size++; }
  while (besti + size < ahi && bestj + size < bhi && a[besti + size] === b[bestj + size]) size++;
  return [besti, bestj, size];
}

/** 2 × matching characters / total characters, between 0 and 1. */
export function similarity(first, second) {
  const a = chars(first), b = chars(second), positions = index(b);
  let matches = 0;
  const todo = [[0, a.length, 0, b.length]];
  while (todo.length) {
    const [alo, ahi, blo, bhi] = todo.pop();
    const [i, j, k] = longestMatch(a, b, positions, alo, ahi, blo, bhi);
    if (!k) continue;
    matches += k;
    if (alo < i && blo < j) todo.push([alo, i, blo, j]);
    if (i + k < ahi && j + k < bhi) todo.push([i + k, ahi, j + k, bhi]);
  }
  const total = a.length + b.length;
  return total ? (2 * matches) / total : 1;
}
