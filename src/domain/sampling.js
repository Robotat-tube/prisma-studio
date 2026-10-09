/**
 * The second reviewer's random sample and the blind sheet they fill in.
 * @module domain/sampling
 */
import { writeRows } from "./csv.js";
import { sample } from "./seeded-random.js";
import { textAfterAbstractHeading } from "./records.js";

export const SECOND_REVIEWER_DIR = "09 - Second reviewer";
export const SHEET_COLUMNS = Object.freeze(["record_id", "title", "authors", "year", "journal", "doi", "abstract", "decision", "reason"]);

/**
 * Records eligible for the sample at a stage: all records (title/abstract) or those with a full-text
 * decision field (full text). Sorted by id.
 * @param {import("./records.js").ReviewRecord[]} records @param {"ta"|"ft"} stage
 */
export const samplePool = (records, stage) =>
  records.filter(r => stage === "ta" || (r.props.ft_decision ?? "") !== "").map(r => r.id).sort();

/**
 * The ids drawn for a seed: ceil(fraction × pool) records, the same for every run with that seed:
 * random.Random(seed).sample(pool, k).
 * @returns {Set<string>}
 */
export function drawSample(pool, fraction, seed) {
  const k = Math.ceil(fraction * pool.length);
  return new Set(sample(seed, pool, k));
}

export const sheetName = (stage, today, seed) => `${stage}-sample ${today} seed ${seed}.csv`;

/** The blind sheet (CSV with a BOM, as Excel expects): no decisions of the first reviewer. */
export function sheetText(records) {
  const rows = [...records].sort((a, b) => (a.id < b.id ? -1 : 1)).map(r => {
    const p = r.props;
    return [r.id, p.title, p.authors, p.year, p.journal, p.doi, textAfterAbstractHeading(r.body), "", ""];
  });
  return "﻿" + writeRows([SHEET_COLUMNS, ...rows]);
}
