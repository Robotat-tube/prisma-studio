/**
 * The page's backend in the browser: answers the requests the Review Studio page makes (state, help,
 * actions, uploads, downloads, folders) with a ReviewSession on a folder the user picked. Replaces the
 * Python server; the page itself is unchanged apart from calling this object instead of fetch().
 * @module ui/backend
 */
import { browserFolder, requestAccess } from "../adapters/browser-folder.js";
import { getReview, recentReviews, rememberReview } from "../adapters/browser-store.js";
import { fetchHttp } from "../adapters/fetch-http.js";
import { pdfjsText } from "../adapters/pdfjs-text.js";
import { AmendmentRequired, emptyLibrary, openLibrary, OpenAlexClient, ReviewSession } from "../index.js";
import { recordView, snapshot } from "./view-model.js";

/** What makes a folder a review folder (any of these). */
const REVIEW_MARKERS = ["review_state.json", "08 - Records", "07 - Searches.csv"];

const extension = path => (/\.[^./]+$/.exec(path)?.[0] ?? "").toLowerCase();

/** A JSON answer as the page expects from the server. */
const answer = (status, body) => ({ status, ok: status < 400, body });

export class Backend {
  /** @type {ReviewSession|null} */ session = null;
  /** @type {import("../adapters/browser-store.js").SavedReview|null} */ entry = null;
  #uploads = new Map();       // upload token -> File
  #pdfFolders = new Map();    // folder name -> handle (folders scanned for PDFs in this visit)
  #lastPdfFolder = null;

  /**
   * @param {object} p
   * @param {object} p.help help texts (web/help.json) @param {{record: string, publication: string}} p.templates note templates
   * @param {object} p.pdfjs the pdf.js module
   */
  constructor({ help, templates, pdfjs }) {
    this.help = help;
    this.templates = templates;
    this.pdfText = pdfjsText(pdfjs);
    this.openalex = new OpenAlexClient({ http: fetchHttp() });
  }

  // ------------------------------------------------------------ reviews

  /** Is this folder a review folder? */
  static async isReviewFolder(handle) {
    const folder = browserFolder(handle);
    for (const m of REVIEW_MARKERS) if (await folder.exists(m)) return true;
    return false;
  }

  /** Opens a remembered review (asks for access; needs a click). */
  async open(entry) {
    if (!(await requestAccess(entry.handle))) throw new Error("Access to the folder was not granted.");
    const s = entry.settings ?? {};
    let library = emptyLibrary();
    if (s.library && (await requestAccess(s.library))) library = await openLibrary(browserFolder(s.library));
    const clock = { today: () => new Date().toLocaleDateString("sv"), now: () => new Date().toLocaleString("sv").slice(0, 16) };
    this.session = await ReviewSession.open(browserFolder(entry.handle), {
      clock, library, openalex: this.openalex, devMode: false,
      settings: { name: entry.name.replace(/ records$/, ""), recordsPath: s.recordsPath || `${entry.name}/08 - Records`, template: this.templates.record },
    });
    this.entry = await rememberReview(entry.handle, s);
    if (!(await this.session.repo.folder.exists("review_state.json"))) {      // a new review: its first files
      await this.session.repo.log("init", "review workspace created");
      await this.session.save();
    }
    return this.session;
  }

  /** Lets the user pick a review folder (or an empty folder for a new review) and remembers it. */
  async pickFolder() {
    const handle = await window.showDirectoryPicker({ id: "review", mode: "readwrite" });
    return rememberReview(handle);
  }

  /** Names for the review menu (the open review first). */
  async reviewNames() {
    return (await recentReviews()).map(r => r.name);
  }

  async #reviewByName(name) {
    return (await recentReviews()).find(r => r.name === name) ?? null;
  }

  // ------------------------------------------------------------ requests from the page

  /** GET /api/help, /api/state?review=…, /api/reviews */
  async get(url) {
    const u = new URL(url, "http://app.local/");          // only the path and query matter
    if (u.pathname.endsWith("/api/help")) return this.help;
    if (u.pathname.endsWith("/api/reviews")) return { reviews: await this.reviewNames() };
    if (u.pathname.endsWith("/api/state")) {
      const name = u.searchParams.get("review");
      if (name && name !== this.entry?.name) {
        const entry = await this.#reviewByName(name);
        if (!entry) throw new Error(`Review "${name}" is not open in this browser.`);
        await this.open(entry);
      }
      return this.snapshot();
    }
    throw new Error(`Unknown request ${u.pathname}`);
  }

  snapshot() {
    return snapshot(this.session, { review: this.entry.name, reviews: [], vault: this.entry.settings?.vault ?? "" })
      .then(async s => ({ ...s, reviews: await this.reviewNames() }));
  }

  /** A file the user chose for an action (export, sheet, PDF); returns the token the action refers to. */
  upload(file) {
    const token = `upload:${crypto.randomUUID()}`;
    this.#uploads.set(token, file);
    return token;
  }

  async #uploaded(token) {
    const file = this.#uploads.get(token);
    if (!file) throw new Error("The chosen file is no longer available; choose it again.");
    return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
  }

  /** Saves a file of the review folder to the user's downloads. */
  async download(path) {
    const bytes = await this.session.repo.folder.readBytes(path);
    const url = URL.createObjectURL(new Blob([bytes]));
    const a = Object.assign(document.createElement("a"), { href: url, download: path.split("/").pop() });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  /** POST /api/action: one action of the page. Answers like the server: {status, ok, body}. */
  async action(action, args = {}) {
    try {
      const result = await this.#run(action, args);
      if (result?.raw) return answer(200, result.raw);
      const body = { message: typeof result === "string" ? result : (result?.message ?? "") };
      if (result?.download) body.download = result.download;
      if (result?.scan) body.scan = result.scan;
      if (!action.startsWith("preview") && !action.startsWith("record_")) body.state = await this.snapshot();
      return answer(200, body);
    } catch (e) {
      if (e instanceof AmendmentRequired) return answer(409, { amendment: e.what });
      if (e?.name === "AbortError") return answer(400, { error: "cancelled" });
      console.error(e);
      return answer(400, { error: e.message });
    }
  }

  async #run(action, a) {
    const s = this.session;
    const amendment = a.amendment ?? "";
    switch (action) {
      case "dev_mode": return s.setDevMode(a.on);
      case "ai_mode": return s.setAiMode(a.stage, a.mode, amendment);
      case "stage_status": return s.setStageStatus(a.stage, a.status, a.reason ?? "");
      case "add_idea": return s.addIdea(a.text);
      case "save_questions": return s.saveQuestions(a.q, a.why ?? "", amendment);
      case "save_concepts": return s.saveConcepts(a.concepts, a.why ?? "", amendment);
      case "preview_queries": return { raw: { queries: s.previewQueries(a.concepts) } };
      case "save_databases": return s.saveDatabases(a.databases, amendment);
      case "save_manual_query": return s.saveManualQuery(a.db, a.text ?? null, amendment);
      case "pilot_openalex": return s.pilotOpenalex(a.note ?? "");
      case "pilot_file": { const f = await this.#uploaded(a.path); return s.pilotFile({ fileName: f.name, bytes: f.bytes, database: a.database, note: a.note ?? "" }); }
      case "pilot_manual": return s.pilotManual(a);
      case "save_protocol_text": return s.saveProtocolText(a.text, { author: a.author ?? "user", generate: a.generate, amendment });
      case "set_test_set": return s.setTestSet(a.stems);
      case "approve_section": return s.approveSection(a.key);
      case "supervisor_review": return s.supervisorReview(a.by ?? "", a.when ?? "");
      case "save_reasons": return s.saveReasons(a.ta, a.ft, amendment);
      case "lock_protocol": return s.lockProtocol(a.registration ?? "");
      case "import": {
        const f = await this.#uploaded(a.path);
        return s.importSearch({ fileName: f.name, bytes: f.bytes, database: a.database, query: a.query, date: a.date || undefined, filters: a.filters ?? "", other: Boolean(a.other) }, { force: Boolean(a.force) });
      }
      case "add_paper": return s.addPaper(a);
      case "decide": return s.decide(a.record_id, a.stage, a.decision, { reason: a.reason ?? "", notes: a.notes });
      case "bulk_decide": return s.bulkDecide(a.ids, a.reason ?? "");
      case "apply_decisions": return s.applyDecisions(a.items, a.stage ?? "ta");
      case "clear_presort": return s.clearPresort(a.ids);
      case "set_record": return s.setRecord(a.record_id, a.fields);
      case "check": return s.check();
      case "report": return s.report();
      case "sample": {
        const seed = String(a.seed ?? "").trim() ? Number(a.seed) : undefined;
        const r = await s.sample({ stage: a.stage, fraction: Number(a.fraction ?? 0.2), seed, redo: Boolean(a.redo) });
        return `Drew ${r.drawn} of ${r.pool} records (seed ${r.seed}). Blind sheet for the second reviewer: ${r.sheet}`;
      }
      case "import_r2": { const f = await this.#uploaded(a.path); return s.importSecondReviewer({ fileName: f.name, text: new TextDecoder().decode(f.bytes), stage: a.stage }); }
      case "snowball": return s.snowball({ directions: a.directions, seeds: a.seeds ?? "included", perSeed: Number(a.per_seed ?? 200) });
      case "find_oa": return s.findOpenAccess();
      case "scan_pdfs": {
        const handle = (a.folder && this.#pdfFolders.get(a.folder)) || (await window.showDirectoryPicker({ id: "pdfs", mode: "read" }));
        this.#pdfFolders.set(handle.name, handle);
        this.#lastPdfFolder = handle;
        const scan = await s.scanPdfs(browserFolder(handle), this.pdfText);
        return { message: scan.message, scan: { ...scan, folder: handle.name } };
      }
      case "attach_found": {
        const handle = this.#pdfFolders.get(a.folder) ?? this.#lastPdfFolder;
        if (!handle) throw new Error("Scan the folder again first.");
        return s.attachFound(a.items, browserFolder(handle));
      }
      case "attach_pdf": { const f = await this.#uploaded(a.path); return s.attachPdf(a.record_id, f.bytes); }
      case "mark_pdf": return s.markPdf(a.record_id, a.status);
      case "save_fields": return s.saveFields(a.fields, amendment);
      case "add_to_library":
        if (!this.session.library.folder) throw new Error("Choose a library folder in Settings first.");
        return s.addToLibrary(this.templates.publication);
      case "prepare_charting": return s.prepareCharting(Boolean(a.appraisal));
      case "appraisal_tool": return s.setAppraisalTool(a.tool);
      case "checklist": return s.setChecklistItem(a.n, a.location ?? "", a.done ?? false);
      case "write_checklist": return s.writeChecklist();
      case "export": { const r = await s.export(a.kind); return { message: r.message, download: r.path }; }
      case "sync": {
        const plan = await s.sync(Boolean(a.apply));
        return plan.changes.map(c => `${c.note}: ${c.add ? "add to" : "remove from"} ${c.key}`).join("\n") || "Publication notes already in sync.";
      }
      case "open_note": return this.#openNote(a.note);
      case "record_abstract": return { raw: { record: recordView(s.repo.records.get(a.record_id), true) } };
      default: throw new Error(`Unknown action ${action}`);
    }
  }

  /** Opens a note in Obsidian (when the vault is set in Settings) or shows the file in a new tab. */
  async #openNote(note) {
    const folder = this.session.repo.folder;
    if (note === "@library") throw new Error("Open the library folder in Obsidian or your file manager.");
    const path = note || "";
    if (!(await folder.exists(path))) throw new Error(`${path.split("/").pop()} does not exist yet — it is created when this stage first saves something.`);
    const vault = this.entry.settings?.vault;
    if (vault && [".md", ".base"].includes(extension(path))) {
      const inVault = `${(this.entry.settings.recordsPath || `${this.entry.name}/08 - Records`).replace(/\/08 - Records$/, "")}/${path}`;
      location.href = `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(inVault)}`;
      return "";
    }
    if (await folder.isDirectory(path)) throw new Error("Open this folder in your file manager.");
    const type = extension(path) === ".pdf" ? "application/pdf" : "text/plain;charset=utf-8";
    window.open(URL.createObjectURL(new Blob([await folder.readBytes(path)], { type })), "_blank");
    return "";
  }
}

export { getReview, recentReviews };
