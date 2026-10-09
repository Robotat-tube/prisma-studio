/**
 * Recognising the same paper across exports: DOI and title normalisation, publication year, and the
 * duplicate index used when a search is imported.
 * @module domain/matching
 */
import { charCount, strip } from "./text-rules.js";
import { similarity } from "./similarity.js";

const NEAR_DUPLICATE = 0.93;          // similarity of two titles in the same year that counts as one paper
const MIN_FUZZY_LENGTH = 25;          // shorter titles are too generic for a near match

/** "https://doi.org/10.1/ABC." → "10.1/abc" */
export function normalizeDoi(doi) {
  return strip(String(doi ?? "")).toLowerCase()
    .replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/, "")
    .replace(/\.+$/, "");
}

/** Lower-case ASCII words: accents removed, punctuation becomes a space. */
export function normalizeTitle(title) {
  const ascii = String(title ?? "").normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase();
  return strip(ascii.replace(/[^a-z0-9]+/g, " "));
}

/** First plausible year (1800–2099) in a value, or "" when there is none. */
export function yearOf(value) {
  const m = /(1[89]|20)\d\d/.exec(String(value ?? ""));
  return m ? Number(m[0]) : "";
}

/** Finds an already known paper by DOI, then exact title (year ±1), then near-identical title (same year). */
export class DuplicateIndex {
  #byDoi = new Map();
  #byTitle = new Map();
  #byYear = new Map();

  /** @param {string} key  @param {string} doi  @param {string} title  @param {number|""} year */
  add(key, doi, title, year) {
    const d = normalizeDoi(doi), t = normalizeTitle(title);
    if (d && !this.#byDoi.has(d)) this.#byDoi.set(d, key);
    if (!t) return;
    if (!this.#byTitle.has(t)) this.#byTitle.set(t, []);
    this.#byTitle.get(t).push([year, key]);
    if (!this.#byYear.has(year)) this.#byYear.set(year, []);
    this.#byYear.get(year).push([t, key]);
  }

  /** @returns {string|null} the key of the matching paper */
  find(doi, title, year) {
    const d = normalizeDoi(doi), t = normalizeTitle(title);
    if (d && this.#byDoi.has(d)) return this.#byDoi.get(d);
    if (!t) return null;
    for (const [y, key] of this.#byTitle.get(t) ?? []) if (!year || !y || Math.abs(year - y) <= 1) return key;
    if (charCount(t) > MIN_FUZZY_LENGTH && year) {
      for (const [other, key] of this.#byYear.get(year) ?? []) if (similarity(t, other) >= NEAR_DUPLICATE) return key;
    }
    return null;
  }
}
