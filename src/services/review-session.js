/**
 * One open review and every action the reviewer can take on it (what each button in the app does).
 * A session holds the records and the review state in memory, and saves both after each action, as the
 * Python tool did per request. Changes to protected parts of a locked protocol throw AmendmentRequired;
 * the UI asks for the reason and repeats the action with it.
 * @module services/review-session
 */
import { aiMode, setAiMode } from "../domain/ai-steps.js";
import * as frontmatter from "../domain/frontmatter.js";
import { FILES, screeningGuide } from "../domain/notes.js";
import { PROTOCOL_FILE } from "../domain/protocol.js";
import { buildQuery } from "../domain/queries.js";
import { comparePy, splitWords, strip } from "../domain/pytext.js";
import { addIdea, amend, event, FULLTEXT_DIR, guardedChange, isLocked, needsAmendment, sameValue, saveQuestions, setStatus, touch } from "../domain/stages.js";
import { checkScreening, drawSample, importSearch, importSecondReviewer, addPaper, writeReport, ReviewError } from "./review-commands.js";
import { addKeptToLibrary, applyLibrarySync, emptyLibrary, planLibrarySync } from "./library.js";
import { loadState, saveState } from "./review-state.js";
import { ReviewRepository } from "./review-repository.js";
import * as actions from "./stage-actions.js";
import { recordsWithoutFullText, scanForPdfs } from "./local-pdfs.js";

/** A protected part of a locked protocol was changed without giving the reason for the amendment. */
export class AmendmentRequired extends Error {
  /** @param {string} what e.g. "concept table" */
  constructor(what) { super(`The protocol is locked: changing the ${what} is an amendment. Give the reason.`); this.what = what; }
}

/**
 * @typedef {object} SessionDeps
 * @property {import("../ports/folder.js").Clock} clock
 * @property {import("./review-repository.js").ReviewSettings} settings
 * @property {import("./library.js").Library} [library]
 * @property {import("./openalex-client.js").OpenAlexClient} [openalex]
 * @property {boolean} [devMode] protocol locks lifted (changes still logged)
 */

export class ReviewSession {
  /** @param {ReviewRepository} repo @param {object} st @param {SessionDeps} deps */
  constructor(repo, st, deps) {
    this.repo = repo;
    this.st = st;
    this.library = deps.library ?? emptyLibrary();
    this.openalex = deps.openalex ?? null;
    this.devMode = Boolean(deps.devMode);
  }

  /** Opens a review folder. @param {import("../ports/folder.js").Folder} folder @param {SessionDeps} deps */
  static async open(folder, deps) {
    const repo = await ReviewRepository.open(folder, deps.clock, deps.settings);
    return new ReviewSession(repo, await loadState(folder), deps);
  }

  get now() { return this.repo.clock.now(); }
  get today() { return this.repo.clock.today(); }

  /** Saves the review state (and the notes written from it). */
  save() { return saveState(this.repo, this.st); }

  /** Re-reads the records from the folder (after changes made outside the session, e.g. in Obsidian). */
  async reload() {
    this.repo = await ReviewRepository.open(this.repo.folder, this.repo.clock, this.repo.settings);
    this.st = await loadState(this.repo.folder);
  }

  #protected() { return needsAmendment(this.st, this.devMode); }

  /** Replaces a protected part of the state, asking for an amendment reason when the protocol is locked. */
  #guarded(key, value, amendment, what) {
    if (this.#protected() && !sameValue(this.st[key], value) && !strip(amendment ?? "")) throw new AmendmentRequired(what);
    return guardedChange(this.st, key, value, { reason: amendment ?? "", devMode: this.devMode, now: this.now });
  }

  #requireOpenalex() {
    if (!this.openalex) throw new ReviewError("OpenAlex is not available in this session.");
    return this.openalex;
  }

  async #afterScreeningChange() {
    await this.repo.save();
    await checkScreening(this.repo);
    touch(this.st, "screening", this.now);
  }

  // ------------------------------------------------------------ settings and stages

  /** Developer mode lifts the protocol locks for this session; every change is still logged. */
  async setDevMode(on) {
    this.devMode = Boolean(on);
    event(this.st, "protocol", "developer mode " + (on ? "switched on: locks lifted" : "switched off"), this.now);
    await this.save();
    return "Developer mode " + (on ? "on — locked parts can be edited without amendments." : "off.");
  }

  async setAiMode(step, mode, amendment = "") {
    if (this.#protected() && aiMode(this.st, step) !== mode && !strip(amendment)) throw new AmendmentRequired("AI assistance");
    const changed = setAiMode(this.st, step, mode, { reason: amendment, devMode: this.devMode, now: this.now });
    if (changed && (await this.repo.folder.exists(PROTOCOL_FILE))) await actions.writeProtocol(this.repo, this.st);
    await this.save();
  }

  async setStageStatus(stage, status, reason = "") {
    setStatus(this.st, stage, status, reason, this.now);
    await this.save();
  }

  async addIdea(text) {
    addIdea(this.st, text, this.now);
    await this.save();
  }

  /** @param {{population: string, concept: string, context: string, main: string, sub: string[]}} q */
  async saveQuestions(q, why = "", amendment = "") {
    if (this.#protected() && !amendment && ["population", "concept", "context", "main", "sub"].some(k => !sameValue(this.st.questions[k], q[k]))) {
      throw new AmendmentRequired("review questions");
    }
    const changed = saveQuestions(this.st, { ...q, why, amendment }, { devMode: this.devMode, now: this.now });
    await this.save();
    return changed ? "New version saved." : "Nothing changed.";
  }

  // ------------------------------------------------------------ concepts and search strings

  /** @param {{name: string, role?: string, terms: string[]}[]} concepts */
  async saveConcepts(concepts, why = "", amendment = "") {
    const next = concepts.filter(c => strip(c.name)).map(c => ({ name: strip(c.name), role: c.role ?? "AND", terms: c.terms.map(strip).filter(Boolean) }));
    const old = this.st.concepts;
    if (this.#guarded("concepts", next, amendment, "concept table")) {
      if (old.length) (this.st.concepts_history ??= []).push({ when: this.now, why: strip(why || amendment || ""), concepts: old });
      touch(this.st, "concepts", this.now);
      event(this.st, "concepts", `concept table saved (${next.length} concepts)` + (strip(why || "") ? ` — ${strip(why)}` : ""), this.now);
    }
    await this.save();
    return "Concepts saved.";
  }

  /** Search strings for a concept table that is not saved yet. */
  previewQueries(concepts) {
    const draft = { ...this.st, concepts };
    return Object.fromEntries(this.st.queries.databases.map(db => [db, buildQuery(draft, db)]));
  }

  async saveDatabases(databases, amendment = "") {
    const next = { ...this.st.queries, databases: databases.map(strip).filter(Boolean) };
    if (this.#guarded("queries", next, amendment, "list of databases")) {
      touch(this.st, "queries", this.now);
      event(this.st, "queries", "databases: " + next.databases.join(", "), this.now);
    }
    await this.save();
  }

  /** A search string edited by hand; `text` null returns to the generated string. */
  async saveManualQuery(database, text, amendment = "") {
    const manual = { ...this.st.queries.manual };
    if (text === null || text === undefined) delete manual[database];
    else manual[database] = text;
    if (this.#guarded("queries", { ...this.st.queries, manual }, amendment, `${database} search string`)) {
      touch(this.st, "queries", this.now);
      event(this.st, "queries", `${database} string ` + (text !== null && text !== undefined ? "edited by hand" : "reset to generated"), this.now);
    }
    await this.save();
  }

  // ------------------------------------------------------------ pilots and test set

  async pilotOpenalex(note = "") {
    const row = await actions.pilotOpenalex(this.repo, this.st, this.#requireOpenalex(), this.library, { note });
    await this.save();
    return `OpenAlex: ${row.hits} hits, test set ${row.retrieved}/${row.test_set}`;
  }

  async pilotFile({ fileName, bytes, database, note = "" }) {
    const row = await actions.pilotFile(this.repo, this.st, this.library, { fileName, bytes, database, query: buildQuery(this.st, database), note });
    await this.save();
    return `${database}: ${row.hits} records, test set ${row.retrieved}/${row.test_set}`;
  }

  async pilotManual({ database, hits, note = "", retrieved = null, available = null }) {
    actions.pilotManual(this.st, { database, query: buildQuery(this.st, database), hits: parseInt(hits, 10), note, retrieved, available }, this.now);
    await this.save();
  }

  /** Marks exactly these library notes as this review's test set (`test_in`). */
  async setTestSet(stems) {
    const want = new Set(stems);
    for (const [stem, props] of this.library.notes) {
      const current = (Array.isArray(props.test_in) ? props.test_in : typeof props.test_in === "string" ? [...props.test_in] : []).filter(Boolean);
      if (current.includes(this.repo.link) === want.has(stem)) continue;
      const next = want.has(stem) ? [...current, this.repo.link] : current.filter(v => v !== this.repo.link);
      const file = `${stem}.md`;
      await this.library.folder.writeText(file, frontmatter.replaceList(await this.library.folder.readText(file), "test_in", next));
      props.test_in = next;
    }
    event(this.st, "pilot", `test set changed (${want.size} papers)`, this.now);
    await this.save();
    return `Test set saved: ${want.size} paper(s).`;
  }

  // ------------------------------------------------------------ protocol

  /** @param {Record<string, string>} text sections by key @param {{author?: string, generate?: boolean, amendment?: string}} options */
  async saveProtocolText(text, { author = "user", generate = false, amendment = "" } = {}) {
    const before = { ...this.st.protocol_text };
    const meta = (this.st.protocol_meta ??= {});
    for (const [k, v] of Object.entries(text)) if ((v || "") !== (before[k] || "")) meta[k] = { by: author, when: this.now };
    if (this.#guarded("protocol_text", text, amendment, "protocol text")) {
      touch(this.st, "protocol", this.now);
      event(this.st, "protocol", "protocol sections saved", this.now);
    }
    let msg = "";
    if (generate) { await actions.writeProtocol(this.repo, this.st); msg = "Protocol.md generated."; }
    await this.save();
    return msg;
  }

  async approveSection(key) {
    (this.st.protocol_meta ??= {})[key] = { by: "approved", when: this.now };
    event(this.st, "protocol", `section '${key}' approved by the reviewer`, this.now);
    await actions.writeProtocol(this.repo, this.st);
    await this.save();
  }

  async supervisorReview(by, when = "") {
    const name = strip(by ?? "");
    this.st.supervisor_review = name ? { by: name, when: when || this.today } : {};
    event(this.st, "protocol", name ? `protocol reviewed by ${name}` : "supervisor review removed", this.now);
    await this.save();
  }

  /** Saves the exclusion reasons in the screening guide (an amendment of the criteria once locked). */
  async saveReasons(ta, ft, amendment = "") {
    const nextTa = ta.map(strip).filter(Boolean), nextFt = ft.map(strip).filter(Boolean);
    const current = await this.repo.reasons();
    if (!sameValue([[...current.ta], [...current.ft]], [nextTa, nextFt])) {
      if (this.#protected()) {
        if (!strip(amendment)) throw new AmendmentRequired("exclusion reasons");
        amend(this.st, "criteria", amendment, this.now);
      } else if (isLocked(this.st) && this.devMode) {
        event(this.st, "protocol", "developer mode: exclusion reasons changed without an amendment", this.now);
      }
      const folder = this.repo.folder;
      if (!(await folder.exists(FILES.guide))) await folder.writeText(FILES.guide, screeningGuide(this.repo.link, this.repo.settings.generator));
      const text = await folder.readText(FILES.guide);
      await folder.writeText(FILES.guide, frontmatter.replaceList(frontmatter.replaceList(text, "ta_reasons", nextTa), "ft_reasons", nextFt));
      event(this.st, "protocol", "exclusion reasons edited", this.now);
    }
    await this.save();
    return "Exclusion reasons saved.";
  }

  /** What must be in order before locking. */
  lockChecks() { return actions.protocolLockChecks(this.repo, this.st); }

  /** Changes after locking that bypassed the amendment log. */
  integrityProblems() { return actions.protocolIntegrity(this.repo, this.st); }

  async lockProtocol(registration = "") {
    await actions.writeProtocol(this.repo, this.st);
    await actions.lockProtocol(this.repo, this.st, { registration });
    await this.save();
    return "Protocol locked.";
  }

  // ------------------------------------------------------------ searches and screening

  /** Imports a database export; before the protocol is locked (or registration skipped) only with `force`. */
  async importSearch(search, { force = false } = {}) {
    if (!isLocked(this.st) && this.st.stages.registration.status !== "skipped" && !force) throw new ReviewError("NOT_LOCKED");
    const msg = await importSearch(this.repo, search, this.library);
    touch(this.st, "searches", this.now);
    event(this.st, "searches", `${search.database} export imported`, this.now);
    await this.save();
    return msg;
  }

  addPaper(paper) { return addPaper(this.repo, paper, this.library); }

  /** One screening decision (with the reason when excluding, and optionally the notes). */
  async decide(recordId, stage, decision, { reason = "", notes } = {}) {
    const r = this.repo.records.get(recordId);
    const [dkey, rkey] = stage === "ta" ? ["ta_decision", "ta_reason"] : ["ft_decision", "ft_reason"];
    const props = { ...r.props, [dkey]: decision, [rkey]: decision === "exclude" ? reason : "" };
    if (notes !== undefined && notes !== null) props.notes = notes;
    this.repo.put({ ...r, props });
    await this.#afterScreeningChange();
    await this.save();
  }

  /** Confirms rule-based pre-sorted records as excluded (each with its pre-sort code, else `reason`). */
  async bulkDecide(ids, reason = "") {
    let n = 0;
    for (const id of ids) {
      const r = this.repo.records.get(id);
      if (!r || r.props.ta_decision !== "pending") continue;
      this.repo.put({ ...r, props: { ...r.props, ta_decision: "exclude", ta_reason: r.props.presort || reason,
        notes: (r.props.notes || "") + " [pre-sorted by rule, confirmed by reviewer]" } });
      n++;
    }
    await this.#afterScreeningChange();
    event(this.st, "screening", `${n} rule-based pre-sorted records confirmed as excluded by the reviewer`, this.now);
    await this.save();
    return `${n} record(s) excluded.`;
  }

  /** Saves a reviewed batch of AI-suggested decisions as the reviewer's; each record notes whether it was changed. */
  async applyDecisions(items, stage = "ta") {
    const ft = stage === "ft";
    const [dkey, rkey, ai] = ft ? ["ft_decision", "ft_reason", "ai_ft_"] : ["ta_decision", "ta_reason", "ai_"];
    let n = 0;
    for (const it of items) {
      const r = this.repo.records.get(it.id);
      if (!r) continue;
      const f = { ...r.props };
      if ((f[dkey] || "pending") !== "pending" || (ft && !["include", "unsure"].includes(f.ta_decision))) continue;
      f[dkey] = it.decision;
      f[rkey] = it.decision === "exclude" ? (it.reason ?? "") : "";
      const agreed = it.decision === f[ai + "decision"] && f[rkey] === (f[ai + "reason"] || "");
      const what = ft ? "full-text " : "";
      f.notes = strip((f.notes || "") + (agreed ? ` [AI ${what}suggestion confirmed by reviewer]` : ` [reviewer changed AI ${what}suggestion]`));
      this.repo.put({ ...r, props: f });
      n++;
    }
    await this.#afterScreeningChange();
    event(this.st, "screening", `batch of ${n} AI-suggested ${ft ? "full-text" : "title/abstract"} decisions reviewed and confirmed by the reviewer`, this.now);
    await this.save();
    return `${n} decision(s) saved.`;
  }

  /** Returns pre-sorted records to the normal screening queue. */
  async clearPresort(ids) {
    for (const id of ids) {
      const r = this.repo.records.get(id);
      if (r?.props.presort) this.repo.put({ ...r, props: { ...r.props, presort: "", presort_reason: "" } });
    }
    await this.repo.save();
    event(this.st, "screening", `${ids.length} pre-sorted record(s) returned to manual screening`, this.now);
    await this.save();
    return `${ids.length} record(s) back in the normal queue.`;
  }

  /** Edits the fields a reviewer may set directly: charting values, notes, appraisal, PDF status, open-access link. */
  async setRecord(recordId, fields) {
    const r = this.repo.records.get(recordId);
    const allowed = Object.entries(fields).filter(([k]) => k.startsWith("chart_") || ["notes", "appraisal", "appraisal_note", "pdf_status", "oa_url"].includes(k));
    this.repo.put({ ...r, props: { ...r.props, ...Object.fromEntries(allowed) } });
    await this.repo.save();
    if (Object.keys(fields).some(k => k.startsWith("chart_"))) touch(this.st, "charting", this.now);
    if (Object.keys(fields).some(k => k.startsWith("appraisal"))) touch(this.st, "appraisal", this.now);
    await this.save();
  }

  async check() {
    const { problems, updated } = await checkScreening(this.repo);
    return `${this.repo.records.size} records checked, ${updated} updated (full-text queue / screening date).` +
      problems.map(p => `\n  ${p.record.id}: ${p.text}`).join("") + "\n" +
      (problems.length ? `${problems.length} problem(s) to fix in Obsidian.` : "No problems.");
  }

  report() { return writeReport(this.repo, this.library); }

  // ------------------------------------------------------------ second reviewer

  async sample({ stage, fraction = 0.2, seed, redo = false }) {
    const result = await drawSample(this.repo, { stage, fraction, seed, redo });
    touch(this.st, "reviewer", this.now);
    event(this.st, "reviewer", `${stage} sample drawn`, this.now);
    await this.save();
    return result;
  }

  async importSecondReviewer({ fileName, text, stage }) {
    const msg = await importSecondReviewer(this.repo, { fileName, text, stage }, this.library);
    event(this.st, "reviewer", `${stage} sheet imported`, this.now);
    await this.save();
    return msg;
  }

  // ------------------------------------------------------------ snowballing and retrieval

  async snowball({ directions, seeds = "included", perSeed = 200, log }) {
    const s = await actions.snowballRound(this.repo, this.st, this.#requireOpenalex(), this.library, { directions, seeds, perSeed, log });
    await this.save();
    return `Round ${s.round}: ` + s.directions.map(d => `${d} ${s[d].new} new`).join(", ");
  }

  async findOpenAccess() {
    const n = await actions.findOpenAccess(this.repo, this.st, this.#requireOpenalex());
    await this.save();
    return `Open-access links found for ${n} record(s).`;
  }

  async attachPdf(recordId, bytes) {
    await actions.attachPdf(this.repo, this.st, recordId, bytes);
    await this.save();
  }

  /**
   * Looks for full texts already on the PC: matches the PDFs in a folder (and its subfolders) to records
   * waiting for one. Nothing is copied until the reviewer confirms (attachFound).
   * @param {import("../ports/folder.js").Folder} pdfFolder @param {import("../ports/pdf-text.js").PdfText} pdfText
   * @param {{cache?: Map<string, object>, onProgress?: (done: number, total: number) => void}} [options]
   */
  async scanPdfs(pdfFolder, pdfText, options = {}) {
    const need = await recordsWithoutFullText(this.repo);
    const result = await scanForPdfs(pdfFolder, need, pdfText, options);
    for (const m of result.matches) Object.assign(m, { title: need.get(m.record_id).title, year: need.get(m.record_id).year });
    this.st.pdf_folders = [pdfFolder.name, ...(this.st.pdf_folders ?? []).filter(f => f !== pdfFolder.name)].slice(0, 5);
    await this.save();
    return { ...result, message: `${result.pdfs} PDF(s) read: ${result.matches.length} match(es) for ${result.records} record(s) without a full text.` };
  }

  /** Copies the confirmed matches into the review under each record's name. @param {{record_id: string, pdf: string}[]} items */
  async attachFound(items, pdfFolder) {
    let n = 0;
    for (const it of items) {
      if (!this.repo.records.has(it.record_id) || !(await pdfFolder.exists(it.pdf))) continue;
      await actions.attachPdf(this.repo, this.st, it.record_id, await pdfFolder.readBytes(it.pdf));
      n++;
    }
    event(this.st, "retrieval", `${n} full text(s) attached from a local folder (${pdfFolder.name}), each match confirmed by the reviewer`, this.now);
    await this.save();
    return `${n} PDF(s) copied into ${FULLTEXT_DIR}.`;
  }

  async markPdf(recordId, status) {
    await actions.markPdf(this.repo, this.st, recordId, status);
    await this.save();
  }

  // ------------------------------------------------------------ charting, appraisal, report

  /** @param {{name: string, description?: string}[]} fields */
  async saveFields(fields, amendment = "") {
    const next = fields.filter(f => strip(f.name)).map(f => ({ name: splitWords(strip(f.name).toLowerCase()).join("_"), description: f.description ?? "" }));
    if (this.#guarded("charting", { ...this.st.charting, fields: next }, amendment, "charting form")) {
      touch(this.st, "charting", this.now);
      event(this.st, "charting", `charting form saved (${next.length} fields)`, this.now);
    }
    await this.save();
  }

  async prepareCharting(appraisal = false) {
    const n = await actions.prepareCharting(this.repo, this.st, { appraisal });
    await this.save();
    return `Columns added to ${n} included record(s).`;
  }

  async setAppraisalTool(tool) {
    this.st.charting.appraisal_tool = tool;
    touch(this.st, "appraisal", this.now);
    event(this.st, "appraisal", `approach: ${tool}`, this.now);
    await this.save();
  }

  async setChecklistItem(n, location = "", done = false) {
    actions.setChecklist(this.st, n, location, done, this.now);
    await actions.writeChecklist(this.repo, this.st);
    await this.save();
  }

  async writeChecklist() {
    await actions.writeChecklist(this.repo, this.st);
    await this.save();
    return "Checklist note written.";
  }

  /** @param {"bib"|"csv"} kind @returns {Promise<{message: string, path: string}>} */
  async export(kind) {
    const path = kind === "bib" ? await actions.exportBibtex(this.repo, this.st) : await actions.exportCharting(this.repo, this.st);
    await this.save();
    return { message: `Exported ${path.split("/").pop()}`, path };
  }

  /** Copies the included papers to the library (publication template text needed for new notes). */
  async addToLibrary(template) {
    const done = await addKeptToLibrary(this.repo, this.st, this.library, { template });
    await this.save();
    return "Library: " + ([...done].map(([k, v]) => `${v} ${k}`).join(", ") || "nothing to add") + ".";
  }

  /** Marks in the library which publications this review considered and included. */
  async sync(apply = false) {
    const plan = planLibrarySync(this.repo, this.library);
    if (apply) await applyLibrarySync(this.library, this.repo, plan);
    return plan;
  }

  /** Records sorted by id, for the UI. */
  records() { return [...this.repo.records.values()].sort((a, b) => comparePy(a.id, b.id)); }
}
