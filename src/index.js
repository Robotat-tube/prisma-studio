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
export { sample as seededSample } from "./domain/seeded-random.js";
export { APP_GENERATOR, FILES } from "./domain/notes.js";
export { normalizeNewlines } from "./domain/text-rules.js";
export * as stages from "./domain/stages.js";
export { AI_STEPS, aiMode, aiPrompt, setAiMode } from "./domain/ai-steps.js";
export { buildQuery, cleanTerms, openalexQuery } from "./domain/queries.js";
export { lockChecks, protocolMarkdown } from "./domain/protocol.js";
export { chartingProgress, workComplete } from "./domain/progress.js";

// services: use cases
export { ReviewRepository } from "./services/review-repository.js";
export { applyLibrarySync, emptyLibrary, openLibrary, planLibrarySync, testSet } from "./services/library.js";
export {
  addEntries, addPaper, checkScreening, drawSample, importSearch, importSecondReviewer, ReviewError, writeReport,
} from "./services/review-commands.js";
export { loadState, saveState, STATE_FILE } from "./services/review-state.js";
export * as stageActions from "./services/stage-actions.js";
export { addKeptToLibrary } from "./services/library.js";
export { OpenAlexClient, OpenAlexError } from "./services/openalex-client.js";
export { AmendmentRequired, ReviewSession } from "./services/review-session.js";
export { listPdfs, recordsWithoutFullText, scanForPdfs } from "./services/local-pdfs.js";
export { aiAttach, aiChart, aiContext, AiNotAllowed, aiSecondReviewer, aiSuggest } from "./services/ai-assist.js";
export { matchPdfs, summarizePdf } from "./domain/pdf-matching.js";

// adapters
export { memoryFolder } from "./adapters/memory-folder.js";
export { fetchHttp } from "./adapters/fetch-http.js";
export { pdfjsText } from "./adapters/pdfjs-text.js";
