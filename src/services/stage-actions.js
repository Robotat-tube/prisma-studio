/**
 * Use cases of the stages around the records: protocol (write, lock, checks), pilots, snowballing,
 * full-text retrieval, charting and appraisal, checklist and exports. Each changes the state object it is
 * given; the caller saves it with review-state.saveState().
 * @module services/stage-actions
 */
import { DuplicateIndex, normalizeDoi, yearOf } from "../domain/matching.js";
import { parseExport } from "../domain/importers.js";
import { shortId, WORK_FIELDS, workToEntry } from "../domain/openalex.js";
import { isIncluded } from "../domain/progress.js";
import { frozenProtocolName, integrityProblems, lockChecks, protocolMarkdown, PROTOCOL_FILE } from "../domain/protocol.js";
import { openalexQuery } from "../domain/queries.js";
import { chars, comparePy, strip } from "../domain/pytext.js";
import { event, FULLTEXT_DIR, isLocked, touch } from "../domain/stages.js";
import { bibtex, chartingBase, chartingCsv, checklistEvidence, checklistNote, STAGE_FILES } from "../domain/stage-notes.js";
import { FILES } from "../domain/notes.js";
import { APP_GENERATOR } from "../domain/notes.js";
import { addEntries, decodeExport, ReviewError } from "./review-commands.js";
import { emptyLibrary, testSet } from "./library.js";
import { STATE_FILE } from "./review-state.js";

const recordStem = r => r.file.split("/").pop().replace(/\.md$/, "");
const generatorOf = repo => repo.settings.generator ?? APP_GENERATOR;
const includedRecords = repo => [...repo.records.values()].filter(r => isIncluded(r.props)).sort((a, b) => comparePy(String(a.props.record_id), String(b.props.record_id)));

/** SHA-256 of bytes as hex (Web Crypto: browsers and Node). */
async function sha256(bytes) {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** The test set as {note name: properties}. */
const testSetNotes = (repo, library) => new Map(testSet(library, repo.link).map(stem => [stem, library.notes.get(stem)]));

// ---------------------------------------------------------------- protocol

/** Writes 05 - Protocol.md from the stages. */
export async function writeProtocol(repo, st) {
  const reasons = await repo.reasons();
  await repo.folder.writeText(PROTOCOL_FILE, protocolMarkdown({ reviewName: repo.name, reviewLink: repo.link, st, ftReasons: reasons.ft, generatedBy: generatorOf(repo).stagesBy }));
  touch(st, "protocol", repo.clock.now());
  event(st, "protocol", "protocol draft regenerated", repo.clock.now());
}

/** Freezes the protocol: a registered copy with its checksum; later changes to protected parts are amendments. */
export async function lockProtocol(repo, st, { registration = "" } = {}) {
  if (isLocked(st)) throw new ReviewError(`The protocol is already locked (${st.protocol.locked}).`);
  const day = repo.clock.today(), name = frozenProtocolName(day), reasons = await repo.reasons();
  await repo.folder.writeText(name, protocolMarkdown({ reviewName: repo.name, reviewLink: repo.link, st, ftReasons: reasons.ft, frozen: day, generatedBy: generatorOf(repo).stagesBy }));
  Object.assign(st.protocol, { locked: day, file: name, sha256: await sha256(await repo.folder.readBytes(name)),
    registration: strip(registration), snapshot: { ta_reasons: [...reasons.ta], ft_reasons: [...reasons.ft] } });
  st.stages.registration = { status: "done", reason: "", updated: repo.clock.now() };
  event(st, "registration", `protocol locked (${name})` + (registration ? `, registration ${registration}` : "")
    + (st.protocol.commit ? `, commit ${chars(st.protocol.commit).slice(0, 10).join("")}` : ""), repo.clock.now());
}

/** What must be in order before locking. */
export const protocolLockChecks = async (repo, st) => lockChecks(st, await repo.reasons());

/** Changes after locking that bypassed the amendment log. */
export async function protocolIntegrity(repo, st) {
  const file = st.protocol.file;
  const hash = isLocked(st) && file && (await repo.folder.exists(file)) ? await sha256(await repo.folder.readBytes(file)) : null;
  return integrityProblems(st, await repo.reasons(), hash);
}

// ---------------------------------------------------------------- pilots

/** Hit count of the concept query in OpenAlex titles/abstracts, and test-set recall (by DOI). */
export async function pilotOpenalex(repo, st, openalex, library = emptyLibrary(), { query, note = "" } = {}) {
  const q = query || openalexQuery(st);
  if (!q) throw new ReviewError("The concept table is empty.");
  const filter = `title_and_abstract.search:${q}`;
  if (q.includes(",")) throw new ReviewError("OpenAlex filters cannot contain commas; remove them from the terms.");
  const hits = (await openalex.get("works", { filter, "per-page": 1, select: "id" })).meta.count;
  const withDoi = new Map([...testSetNotes(repo, library)].filter(([, p]) => p.doi).map(([stem, p]) => [normalizeDoi(p.doi), stem]));
  const found = new Set(), dois = [...withDoi.keys()];
  for (let i = 0; i < dois.length; i += 50) {
    const res = await openalex.get("works", { filter: `${filter},doi:${dois.slice(i, i + 50).join("|")}`, "per-page": 50, select: "doi" });
    for (const w of res.results) if (w.doi) found.add(normalizeDoi(w.doi));
  }
  const missed = [...withDoi].filter(([d]) => !found.has(d)).map(([, stem]) => stem).sort(comparePy);
  const now = repo.clock.now();
  const row = { when: now, database: "OpenAlex (title/abstract)", query: q, hits, test_set: withDoi.size, retrieved: found.size, missed, note };
  st.pilots.push(row);
  touch(st, "pilot", now);
  event(st, "pilot", `OpenAlex pilot: ${hits} hits, test set ${found.size}/${withDoi.size}`, now);
  return row;
}

/** Pilot from a database export: hit count = records in the file, recall against the test set. */
export async function pilotFile(repo, st, library = emptyLibrary(), { fileName, bytes, database, query, note = "" }) {
  const entries = parseExport(fileName, decodeExport(bytes));
  const index = new DuplicateIndex();
  entries.forEach((e, i) => index.add(i, e.doi, e.title, e.year));
  const tests = testSetNotes(repo, library);
  const missed = [...tests].filter(([, p]) => index.find(p.doi, p.title, yearOf(p.year)) === null).map(([s]) => s).sort(comparePy);
  const now = repo.clock.now();
  const row = { when: now, database, query, hits: entries.length, test_set: tests.size, retrieved: tests.size - missed.length, missed, note };
  st.pilots.push(row);
  touch(st, "pilot", now);
  event(st, "pilot", `${database} pilot from export: ${entries.length} records, test set ${row.retrieved}/${tests.size}`, now);
  return row;
}

/** A pilot run by hand in a database, optionally with the test-set check done there too. */
export function pilotManual(st, { database, query, hits, note = "", retrieved = null, available = null }, now) {
  const checked = ![null, undefined, ""].includes(retrieved) && ![null, undefined, ""].includes(available);
  const row = { when: now, database, query, hits: parseInt(hits, 10), test_set: checked ? parseInt(available, 10) : "",
    retrieved: checked ? parseInt(retrieved, 10) : "", missed: [], note };
  st.pilots.push(row);
  touch(st, "pilot", now);
  event(st, "pilot", `${database} pilot: ${hits} hits` + (checked ? `, test set ${retrieved}/${available}` : "") + " (entered by hand)", now);
  return row;
}

// ---------------------------------------------------------------- snowballing

/**
 * One snowballing round in OpenAlex: references (backward) and citing works (forward) of the seed records
 * are imported as a new "other" source per direction.
 * @param {object} options @param {string[]} [options.directions] @param {"included"|"sought"} [options.seeds]
 * @param {number} [options.perSeed] @param {(line: string) => void} [options.log]
 */
export async function snowballRound(repo, st, openalex, library = emptyLibrary(), { directions = ["backward", "forward"], seeds = "included", perSeed = 200, log = () => {} } = {}) {
  const records = [...repo.records.values()];
  const pool = (seeds === "included" ? records.filter(r => isIncluded(r.props)) : records.filter(r => ["include", "unsure"].includes(r.props.ta_decision)))
    .filter(r => r.props.doi);
  if (!pool.length) throw new ReviewError("No seed records with a DOI (included records are used as seeds).");
  const n = st.snowballing.rounds.length + 1;
  const summary = { round: n, when: repo.clock.now(), seeds: pool.length, directions: [...directions] };
  for (const direction of directions) {
    const found = new Map();
    for (const [i, r] of pool.entries()) {
      let w;
      try { w = await openalex.get(`works/doi:${normalizeDoi(r.props.doi)}`, { select: "id,referenced_works" }); }
      catch (e) { log(`  ${r.props.record_id}: not found in OpenAlex (${e.message})`); continue; }
      if (direction === "backward") {
        const ids = (w.referenced_works ?? []).map(shortId).slice(0, perSeed);
        for (let j = 0; j < ids.length; j += 50) {
          const res = await openalex.get("works", { filter: "openalex:" + ids.slice(j, j + 50).join("|"), "per-page": 50, select: WORK_FIELDS });
          for (const x of res.results) found.set(x.id, x);
        }
      } else {
        let cursor = "*", got = 0;
        while (cursor && got < perSeed) {
          const res = await openalex.get("works", { filter: `cites:${shortId(w.id)}`, cursor, "per-page": Math.min(200, perSeed), select: WORK_FIELDS });
          for (const x of res.results) found.set(x.id, x);
          got += res.results.length;
          cursor = res.results.length ? res.meta.next_cursor : null;
        }
      }
      log(`  ${direction}: seed ${i + 1}/${pool.length} done, ${found.size} unique so far`);
    }
    const entries = [...found.values()].map(workToEntry);
    const rows = await repo.searches();
    const id = `S${String(rows.length + 1).padStart(2, "0")}`;
    const { added, duplicates } = await addEntries(repo, entries, id, library);
    rows.push({ id, kind: "other", database: `Snowballing round ${n} (${direction}, OpenAlex)`, date: repo.clock.today(),
      query: `${direction} citations of ${pool.length} ${seeds} records`, filters: `max ${perSeed} per seed`, export: "",
      records: entries.length, new: added, duplicates });
    await repo.writeSearches(rows);
    await repo.log("snowball", `round ${n} ${direction}: ${entries.length} records, ${added} new`);
    summary[direction] = { search: id, records: entries.length, new: added };
  }
  st.snowballing.rounds.push(summary);
  touch(st, "snowballing", repo.clock.now());
  event(st, "snowballing", `round ${n}: ` + directions.map(d => `${d} ${summary[d].new} new`).join(", "), repo.clock.now());
  return summary;
}

/** Per round: records it added and how many of those are now included. @returns {[number, number, number][]} */
export function roundYield(repo, st) {
  return st.snowballing.rounds.map(round => {
    const searches = new Set(round.directions.filter(d => d in round).map(d => round[d].search));
    const added = [...repo.records.values()].filter(r => searches.has((r.props.sources || [null])[0]));
    return [round.round, added.length, added.filter(r => isIncluded(r.props)).length];
  });
}

// ---------------------------------------------------------------- retrieval

/** Records waiting for a full text. */
export const retrievalQueue = repo => [...repo.records.values()].filter(r => r.props.ft_decision === "pending" && r.props.pdf_status !== "not-retrieved");

/** Looks up open-access links in OpenAlex for queued records with a DOI. @returns {Promise<number>} links found */
export async function findOpenAccess(repo, st, openalex) {
  const todo = retrievalQueue(repo).filter(r => r.props.doi && !r.props.oa_url);
  const byDoi = new Map(todo.map(r => [normalizeDoi(r.props.doi), r]));
  const dois = [...byDoi.keys()];
  let hits = 0;
  for (let i = 0; i < dois.length; i += 50) {
    const res = await openalex.get("works", { filter: "doi:" + dois.slice(i, i + 50).join("|"), "per-page": 50, select: "doi,open_access" });
    for (const w of res.results) {
      const url = (w.open_access ?? {}).oa_url;
      const r = byDoi.get(normalizeDoi(w.doi));
      if (r && url) {
        const current = repo.records.get(r.id);
        repo.put({ ...current, props: { ...current.props, oa_url: url } });
        hits++;
      }
    }
  }
  await repo.save();
  touch(st, "retrieval", repo.clock.now());
  event(st, "retrieval", `open-access links found for ${hits} of ${todo.length} records`, repo.clock.now());
  return hits;
}

/** Stores a full text under the record's name in 10 - Full texts and marks it found. */
export async function attachPdf(repo, st, recordId, bytes) {
  const r = repo.records.get(recordId);
  const name = `${recordStem(r)}.pdf`;
  await repo.folder.writeBytes(`${FULLTEXT_DIR}/${name}`, bytes);
  repo.put({ ...r, props: { ...r.props, pdf_status: "found", pdf: `[[${name}]]` } });
  await repo.save();
  touch(st, "retrieval", repo.clock.now());
  event(st, "retrieval", `${recordId}: full text attached`, repo.clock.now());
}

/** Sets a record's pdf_status ("found", "not-retrieved" or ""). */
export async function markPdf(repo, st, recordId, status) {
  const r = repo.records.get(recordId);
  repo.put({ ...r, props: { ...r.props, pdf_status: status } });
  await repo.save();
  touch(st, "retrieval", repo.clock.now());
  event(st, "retrieval", `${recordId}: pdf_status ${status}`, repo.clock.now());
}

// ---------------------------------------------------------------- charting, appraisal, checklist, exports

/** Adds the charting (and appraisal) columns to every included record and writes 12 - Charting.base. */
export async function prepareCharting(repo, st, { appraisal = false } = {}) {
  const keys = [...st.charting.fields.map(f => `chart_${f.name}`), ...(appraisal ? ["appraisal", "appraisal_note"] : [])];
  let n = 0;
  for (const r of [...repo.records.values()].filter(x => isIncluded(x.props))) {
    const missing = keys.filter(k => !(k in r.props));
    if (!missing.length) continue;
    repo.put({ ...r, props: { ...r.props, ...Object.fromEntries(missing.map(k => [k, ""])) } });
    n++;
  }
  await repo.save();
  await writeChartingBase(repo, st, appraisal || ["in-progress", "done"].includes(st.stages.appraisal.status));
  const stage = appraisal ? "appraisal" : "charting";
  touch(st, stage, repo.clock.now());
  event(st, stage, `${stage} columns added to ${n} included records`, repo.clock.now());
  return n;
}

export const writeChartingBase = (repo, st, withAppraisal) =>
  repo.folder.writeText(STAGE_FILES.chartingBase, chartingBase(st, repo.settings.recordsPath, withAppraisal));

/** Charting table of the included records as CSV in 07 - Exports. @returns {Promise<string>} path */
export async function exportCharting(repo, st) {
  const path = `${FILES.exports}/charting ${repo.clock.today()}.csv`;
  await repo.folder.writeText(path, chartingCsv(st, includedRecords(repo).map(r => r.props)));
  event(st, "report", `charting table exported (${path.split("/").pop()})`, repo.clock.now());
  return path;
}

/** The included records as BibTeX in 07 - Exports. @returns {Promise<string>} path */
export async function exportBibtex(repo, st) {
  const path = `${FILES.exports}/included ${repo.clock.today()}.bib`;
  const records = includedRecords(repo).map(r => r.props);
  await repo.folder.writeText(path, bibtex(records));
  event(st, "report", `BibTeX of ${records.length} included sources exported (${path.split("/").pop()})`, repo.clock.now());
  return path;
}

/** Ticks a PRISMA-ScR item and records where the manuscript reports it. */
export function setChecklist(st, item, location, done, now) {
  st.checklist[String(item)] = { location: strip(location), done: Boolean(done) };
  touch(st, "report", now);
}

/** Evidence the tool sees for each checklist item. */
export async function checklistAuto(repo, st) {
  return checklistEvidence({ st, searches: await repo.searches(), records: [...repo.records.values()].map(r => r.props),
    guideExists: await repo.folder.exists(FILES.guide), flowExists: await repo.folder.exists(FILES.flow) });
}

/** Writes 14 - PRISMA-ScR checklist.md. */
export async function writeChecklist(repo, st) {
  const evidence = await checklistAuto(repo, st);
  await repo.folder.writeText(STAGE_FILES.checklist, checklistNote({ reviewName: repo.name, reviewLink: repo.link, st, today: repo.clock.today(), evidence }));
}

export { STATE_FILE };
