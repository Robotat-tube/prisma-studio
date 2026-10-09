/**
 * Loads and saves one review through a Folder: its records, the searches table, the screening guide
 * and the log. Keeps the records in memory and writes back only the ones that changed.
 * @module services/review-repository
 */
import * as csv from "../domain/csv.js";
import * as frontmatter from "../domain/frontmatter.js";
import { FILES, logHeader, logRow, screeningBase, screeningGuide } from "../domain/notes.js";
import { compareCodePoints } from "../domain/text-rules.js";
import { RECORDS_DIR, recordText } from "../domain/records.js";
import { DEFAULT_FT_REASONS, DEFAULT_TA_REASONS } from "../domain/vocabulary.js";

export const SEARCH_COLUMNS = Object.freeze(["id", "kind", "database", "date", "query", "filters", "export", "records", "new", "duplicates"]);

/** File order: case-insensitive, by code point. */
export const fileOrder = (a, b) => compareCodePoints(a.toLowerCase(), b.toLowerCase()) || compareCodePoints(a, b);

/**
 * @typedef {object} ReviewSettings
 * @property {string} name              review name, e.g. "Project 2 review"
 * @property {string} recordsPath       records folder seen from the Obsidian vault root (for 08 - Screening.base)
 * @property {string} [template]        text of the record template note
 * @property {import("../domain/notes.js").Generator} [generator]
 */

export class ReviewRepository {
  /** @type {Map<string, import("../domain/records.js").ReviewRecord>} */
  records = new Map();
  #changed = new Set();
  /** Each record as last read or written: its text on disk and its parsed form. @type {Map<string, {file: string, text: string, props: object, body: string}>} */
  #base = new Map();

  /**
   * @param {import("../ports/folder.js").Folder} folder
   * @param {import("../ports/folder.js").Clock} clock
   * @param {ReviewSettings} settings
   */
  constructor(folder, clock, settings) {
    this.folder = folder;
    this.clock = clock;
    this.settings = settings;
    this.name = settings.name;
    this.link = `[[${settings.name}]]`;
  }

  /**
   * Opens a review folder and reads every record note in it (several at a time; the order stays the files' order).
   * @param {{onProgress?: (done: number, total: number) => void}} [options]
   */
  static async open(folder, clock, settings, { onProgress = () => {} } = {}) {
    const repo = new ReviewRepository(folder, clock, settings);
    const files = (await folder.list(RECORDS_DIR)).filter(f => /^R.*\.md$/.test(f)).sort(fileOrder);
    const BATCH = 64;
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH).map(name => `${RECORDS_DIR}/${name}`);
      const texts = await Promise.all(batch.map(file => folder.readText(file)));
      batch.forEach((file, k) => {
        const [props, body] = frontmatter.parse(texts[k]);
        if (props.type !== "review-record") return;
        const id = String(props.record_id);
        repo.records.set(id, { id, file, props, body });
        repo.#base.set(id, { file, text: texts[k], props, body });
      });
      onProgress(Math.min(i + BATCH, files.length), files.length);
    }
    return repo;
  }

  /** Records in record-id order. */
  sortedRecords() {
    return [...this.records.values()].sort((a, b) => compareCodePoints(a.id, b.id));
  }

  /** Replaces or adds a record; it is written at the next save(). */
  put(record) {
    this.records.set(record.id, record);
    this.#changed.add(record.id);
  }

  /** Writes the records that changed. @returns {Promise<number>} how many */
  async save() {
    const ids = [...this.#changed];
    for (const id of ids) {
      const r = await this.#withOutsideEdits(this.records.get(id));
      const text = recordText(r);
      await this.folder.writeText(r.file, text);
      this.records.set(id, r);
      this.#base.set(id, { file: r.file, text, props: r.props, body: r.body });
    }
    this.#changed.clear();
    return ids.length;
  }

  /**
   * A record to write, keeping edits made outside the app since it was read (e.g. a note typed in Obsidian):
   * when the file changed on disk, only the properties (and body) this app changed are applied to the disk version.
   */
  async #withOutsideEdits(r) {
    const base = this.#base.get(r.id);
    if (!base || base.file !== r.file || !(await this.folder.exists(r.file))) return r;
    const disk = await this.folder.readText(r.file);
    if (disk === base.text) return r;
    const [props, body] = frontmatter.parse(disk);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    for (const k of new Set([...Object.keys(base.props), ...Object.keys(r.props)])) {
      if (same(base.props[k], r.props[k])) continue;                    // not changed here: the disk value stays
      if (k in r.props) props[k] = r.props[k]; else delete props[k];
    }
    return { ...r, props, body: r.body === base.body ? body : r.body };
  }

  /** Rows of 07 - Searches.csv (all values as text). */
  async searches() {
    if (!(await this.folder.exists(FILES.searches))) return [];
    return csv.readRecords(await this.folder.readText(FILES.searches));
  }

  async writeSearches(rows) {
    await this.folder.writeText(FILES.searches, csv.writeRecords([...SEARCH_COLUMNS], rows));
  }

  /** Allowed exclusion reasons from the screening guide (defaults when there is none). */
  async reasons() {
    if (!(await this.folder.exists(FILES.guide))) return { ta: DEFAULT_TA_REASONS, ft: DEFAULT_FT_REASONS };
    const [props] = frontmatter.parse(await this.folder.readText(FILES.guide));
    const list = v => (Array.isArray(v) && v.length ? v : null);
    return { ta: list(props.ta_reasons) ?? DEFAULT_TA_REASONS, ft: list(props.ft_reasons) ?? DEFAULT_FT_REASONS };
  }

  /** Appends a row to 00 - Review log.md (created on first use). */
  async log(command, details) {
    if (!(await this.folder.exists(FILES.log))) await this.folder.writeText(FILES.log, logHeader(this.name, this.link, this.settings.generator));
    await this.folder.appendText(FILES.log, logRow(this.clock.today(), command, details));
  }

  /** Files of the searches and screening stages, created when the first records arrive. */
  async ensureScreeningFiles() {
    await this.folder.makeDir(RECORDS_DIR);
    if (!(await this.folder.exists(FILES.searches))) await this.writeSearches([]);
    if (!(await this.folder.exists(FILES.guide))) await this.folder.writeText(FILES.guide, screeningGuide(this.link, this.settings.generator));
    if (!(await this.folder.exists(FILES.base))) await this.folder.writeText(FILES.base, screeningBase(this.settings.recordsPath));
  }
}
