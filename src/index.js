/**
 * Public API of PRISMA Studio's engine. The UI and tools import from here only; the folders below are
 * internal and may be reorganised.
 * @module prisma-studio
 */
export * as frontmatter from "./domain/frontmatter.js";
export * as csv from "./domain/csv.js";
export * from "./domain/vocabulary.js";
export { citedAuthors, recordName } from "./domain/names.js";
export { DuplicateIndex, normalizeDoi, normalizeTitle, yearOf } from "./domain/matching.js";
export { similarity } from "./domain/similarity.js";
export { makeEntry, parseBibtex, parseCsv, parseExport, parseRis } from "./domain/importers.js";
export { normalizeNewlines } from "./domain/pytext.js";
