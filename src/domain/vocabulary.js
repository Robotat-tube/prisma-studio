/**
 * Allowed values of the screening properties and the default exclusion reasons.
 * @module domain/vocabulary
 */

export const TA_DECISIONS = Object.freeze(["pending", "include", "exclude", "unsure"]);
export const FT_DECISIONS = Object.freeze(["", "pending", "include", "exclude"]);
export const PDF_STATUSES = Object.freeze(["", "found", "not-retrieved"]);
export const SECOND_REVIEWER_DECISIONS = Object.freeze(["", "include", "exclude", "unsure"]);

export const DEFAULT_TA_REASONS = Object.freeze([
  "E1 wrong concept",
  "E2 wrong context",
  "E3 wrong publication type",
  "E4 language",
  "E5 outside date range",
]);
export const DEFAULT_FT_REASONS = Object.freeze([...DEFAULT_TA_REASONS, "E6 no usable content on the concept"]);

/** Placeholder written into a record whose export had no abstract. */
export const NO_ABSTRACT = "_(no abstract in the export)_";
