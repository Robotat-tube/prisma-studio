/**
 * Use cases on a review's records: import a search, add a paper found another way, check the screening,
 * draw the second reviewer's sample, import their sheet, and write the PRISMA flow report.
 * Each takes a ReviewRepository (and the library where it matters) and returns a short message.
 * @module services/review-commands
 */
import { cohensKappa, comparison, STAGES } from "../domain/agreement.js";
import * as csv from "../domain/csv.js";
import { flowCounts } from "../domain/flow.js";
import { makeEntry, parseExport } from "../domain/importers.js";
import { DuplicateIndex, yearOf } from "../domain/matching.js";
import { FILES, prismaFlowNote } from "../domain/notes.js";
import { comparePy, formatPercent, normalizeNewlines, strip } from "../domain/pytext.js";
import { createRecord, mergeDuplicate, nextRecordId } from "../domain/records.js";
import { drawSample as draw, samplePool, SECOND_REVIEWER_DIR, sheetName, sheetText } from "../domain/sampling.js";
import { checkRecord } from "../domain/screening.js";
import { SECOND_REVIEWER_DECISIONS } from "../domain/vocabulary.js";
import { emptyLibrary, testSet } from "./library.js";

/** A command that cannot run; the message is meant for the reviewer. */
export class ReviewError extends Error {}

/** A seed from 0 to 999 999 from the system's secure random source (as Python's SystemRandom). */
const secureSeed = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;

const sourceId = rows => `S${String(rows.length + 1).padStart(2, "0")}`;

/** Text of an uploaded export as Python reads it: UTF-8 with or without BOM, bad bytes replaced. */
export const decodeExport = bytes => normalizeNewlines(new TextDecoder("utf-8").decode(bytes)).replace(/^﻿/, "");

/**
 * Adds export entries to the review: duplicates are merged into the existing record, new papers become
 * records (linked to the library note when the paper is already in the library).
 * @returns {Promise<{added: number, duplicates: number}>}
 */
export async function addEntries(repo, entries, source, library = emptyLibrary()) {
  await repo.ensureScreeningFiles();
  const index = new DuplicateIndex();
  for (const r of repo.records.values()) index.add(r.id, r.props.doi, r.props.title, yearOf(r.props.year));
  let added = 0, duplicates = 0;
  for (const e of entries) {
    if (!e.title) continue;
    const existing = index.find(e.doi, e.title, e.year);
    if (existing) {
      repo.put(mergeDuplicate(repo.records.get(existing), e, source));
      duplicates++;
      continue;
    }
    const id = nextRecordId(new Set(repo.records.keys()));
    const record = createRecord({ id, entry: e, reviewLink: repo.link, sourceId: source,
      publication: library.index.find(e.doi, e.title, e.year), template: repo.settings.template });
    repo.put(record);
    index.add(id, e.doi, e.title, e.year);
    added++;
  }
  await repo.save();
  return { added, duplicates };
}

/**
 * Imports one database export (or another source with `other`), keeps a copy of the file, records the
 * search in 07 - Searches.csv and refreshes the PRISMA flow.
 * @param {object} search
 * @param {string} search.fileName @param {Uint8Array} search.bytes @param {string} search.database
 * @param {string} search.query the exact search string as run @param {string} [search.date] @param {string} [search.filters]
 * @param {boolean} [search.other] count as "other sources", not a database search
 */
export async function importSearch(repo, { fileName, bytes, database, query, date, filters = "", other = false }, library) {
  const entries = parseExport(fileName, decodeExport(bytes));
  if (!entries.length) throw new ReviewError("No records found in the export (check the format).");
  const rows = await repo.searches();
  const id = sourceId(rows);
  const kept = `${id} - ${fileName}`;
  await repo.folder.writeBytes(`${FILES.exports}/${kept}`, bytes);
  const { added, duplicates } = await addEntries(repo, entries, id, library);
  rows.push({ id, kind: other ? "other" : "database", database, date: date || repo.clock.today(), query, filters,
    export: kept, records: entries.length, new: added, duplicates });
  await repo.writeSearches(rows);
  await repo.log("import", `${id} ${database}: ${entries.length} records, ${added} new, ${duplicates} duplicates`);
  const report = await writeReport(repo, library);
  return `${id} ${database}: ${entries.length} records -> ${added} new, ${duplicates} duplicates (export kept as ${kept})\n${report}`;
}

/** Adds one paper found another way (snowballing, a colleague…) under an "other" source named `via`. */
export async function addPaper(repo, { title, authors = "", year = "", journal = "", doi = "", via, database = "Snowballing" }, library) {
  const rows = await repo.searches();
  let row = rows.find(r => r.kind === "other" && r.query === via);
  if (!row) {
    row = { id: sourceId(rows), kind: "other", database, date: repo.clock.today(), query: via, filters: "", export: "", records: 0, new: 0, duplicates: 0 };
    rows.push(row);
  }
  const { added, duplicates } = await addEntries(repo, [makeEntry({ title, authors, year, journal, doi })], row.id, library);
  for (const [k, v] of [["records", 1], ["new", added], ["duplicates", duplicates]]) row[k] = (parseInt(row[k] || 0, 10) || 0) + v;
  await repo.writeSearches(rows);
  await repo.log("add", `${row.id} (${via}): ${[...title].slice(0, 60).join("")} — ${added ? "new" : "duplicate"}`);
  return `${row.id}: ${added ? "new record" : "already present (source added)"}`;
}

/**
 * Checks every record (allowed values, reasons) and fills what follows from the decisions.
 * @returns {Promise<{problems: {record: object, text: string}[], updated: number}>}
 */
export async function checkScreening(repo, { write = true } = {}) {
  const reasons = await repo.reasons();
  const problems = [];
  for (const record of repo.records.values()) {
    const { props, problems: found, changed } = checkRecord(record.props, reasons, repo.clock.today());
    for (const text of found) problems.push({ record, text });
    if (!changed) continue;
    if (write) repo.put({ ...record, props });
    else repo.records.set(record.id, { ...record, props });
  }
  return { problems, updated: write ? await repo.save() : 0 };
}

/**
 * Draws the second reviewer's random sample and writes their blind sheet.
 * @param {object} p @param {"ta"|"ft"} p.stage @param {number} [p.fraction] @param {number} [p.seed] random when omitted
 * @param {boolean} [p.redo] replace an existing sample (logged) @param {() => number} [p.newSeed]
 */
export async function drawSample(repo, { stage, fraction = 0.2, seed, redo = false, newSeed = secureSeed }) {
  const key = `sample_${stage}`;
  const records = [...repo.records.values()];
  const pool = samplePool(records, stage);
  if (pool.some(id => repo.records.get(id).props[key]) && !redo) throw new ReviewError(`A ${stage} sample already exists; pass --redo to draw a new one (logged).`);
  if (!pool.length) throw new ReviewError("No records in this stage yet.");
  const useSeed = seed ?? newSeed();
  const chosen = draw(pool, fraction, useSeed);
  for (const id of pool) {
    const r = repo.records.get(id);
    if (r.props[key] !== chosen.has(id)) repo.put({ ...r, props: { ...r.props, [key]: chosen.has(id) } });
  }
  await repo.save();
  const name = sheetName(stage, repo.clock.today(), useSeed);
  await repo.folder.writeText(`${SECOND_REVIEWER_DIR}/${name}`, sheetText([...chosen].map(id => repo.records.get(id))));
  await repo.log("sample", `${stage}: ${chosen.size} of ${pool.length} records (${formatPercent(fraction)}), seed ${useSeed}, sheet ${name}`);
  return { seed: useSeed, sheet: `${SECOND_REVIEWER_DIR}/${name}`, drawn: chosen.size, pool: pool.length };
}

/** Imports the decisions of a filled-in second-reviewer sheet. */
export async function importSecondReviewer(repo, { fileName, text, stage }, library) {
  const rows = csv.readRecords(normalizeNewlines(text).replace(/^﻿/, ""));
  let imported = 0;
  const bad = [];
  for (const row of rows) {
    const id = strip(row.record_id ?? ""), decision = strip(row.decision ?? "").toLowerCase();
    if (!repo.records.has(id)) { bad.push(`${id}: unknown record`); continue; }
    if (!SECOND_REVIEWER_DECISIONS.includes(decision)) { bad.push(`${id}: decision "${decision}" not include / exclude / unsure`); continue; }
    const r = repo.records.get(id);
    repo.put({ ...r, props: { ...r.props, [`r2_${stage}_decision`]: decision, [`r2_${stage}_reason`]: strip(row.reason ?? "") } });
    if (decision) imported++;
  }
  await repo.save();
  await repo.log("import-r2", `${stage}: ${imported} second-reviewer decisions from ${fileName}`);
  const report = await writeReport(repo, library);
  return `${imported} decisions imported.${bad.map(b => `\n  ${b}`).join("")}\n${report}`;
}

/** Checks the screening and writes 14 - PRISMA flow.md. */
export async function writeReport(repo, library = emptyLibrary()) {
  const { problems } = await checkScreening(repo);
  const props = [...repo.records.values()].map(r => r.props);
  const searches = await repo.searches();
  const counts = flowCounts(props, searches);
  const sorted = repo.sortedRecords();
  const agreement = STAGES.map(({ stage, label }) => {
    const { pairs, disagreements, sampled } = comparison(sorted, stage);
    const [observed, kappa] = cohensKappa(pairs);
    return { label, sampled, pairs, disagreements, observed, kappa };
  });
  const tests = testSet(library, repo.link).sort(comparePy);
  const found = new Set(props.filter(p => p.publication).map(p => String(p.publication).replace(/^[[\]]+|[[\]]+$/g, "")));
  const missed = tests.filter(s => !found.has(s));
  await repo.folder.writeText(FILES.flow, prismaFlowNote({ reviewName: repo.name, reviewLink: repo.link, today: repo.clock.today(),
    counts, searches, agreement, testSet: tests, missed, problems, generator: repo.settings.generator }));
  return `PRISMA flow written: ${counts.unique} records, ${counts.taPending} awaiting title/abstract, ` +
    `${counts.ftPending} awaiting full text, ${counts.included} included, ${problems.length} problem(s).`;
}
