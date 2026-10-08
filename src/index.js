/**
 * Public API of PRISMA Studio's engine. The UI and tools import from here only; the folders below are
 * internal and may be reorganised.
 * @module prisma-studio
 */

// domain: rules and formats
export * as frontmatter from "./domain/frontmatter.js";
export * as csv from "./domain/csv.js";
export * from "./domain/vocabulary.js";
export { citedAuthors, recordName } from "./domain/names.js";
export { DuplicateIndex, normalizeDoi, normalizeTitle, yearOf } from "./domain/matching.js";
export { similarity } from "./domain/similarity.js";
export { makeEntry, parseBibtex, parseCsv, parseExport, parseRis } from "./domain/importers.js";
export { createRecord, mergeDuplicate, RECORDS_DIR } from "./domain/records.js";
export { checkRecord, isValidReason } from "./domain/screening.js";
export { cohensKappa } from "./domain/agreement.js";
export { flowCounts } from "./domain/flow.js";
export { sample as pythonSample } from "./domain/pyrandom.js";
export { APP_GENERATOR, FILES } from "./domain/notes.js";
export { normalizeNewlines } from "./domain/pytext.js";

// services: use cases
export { ReviewRepository } from "./services/review-repository.js";
export { applyLibrarySync, emptyLibrary, openLibrary, planLibrarySync, testSet } from "./services/library.js";
export {
  addEntries, addPaper, checkScreening, drawSample, importSearch, importSecondReviewer, ReviewError, writeReport,
} from "./services/review-commands.js";

// adapters
export { memoryFolder } from "./adapters/memory-folder.js";
