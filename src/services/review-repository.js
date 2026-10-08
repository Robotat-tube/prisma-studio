/**
 * Loads and saves one review through a Folder: its records, the searches table, the screening guide
 * and the log. Keeps the records in memory and writes back only the ones that changed.
 * @module services/review-repository
 */
import * as csv from "../domain/csv.js";
import * as frontmatter from "../domain/frontmatter.js";
import { FILES, logHeader, logRow, screeningBase, screeningGuide } from "../domain/notes.js";
import { comparePy } from "../domain/pytext.js";
import { RECORDS_DIR, recordText } from "../domain/records.js";
import { DEFAULT_FT_REASONS, DEFAULT_TA_REASONS } from "../domain/vocabulary.js";

export const SEARCH_COLUMNS = Object.freeze(["id", "kind", "database", "date", "query", "filters", "export", "records", "new", "duplicates"]);

/** File order as Python lists a folder on Windows: case-insensitive, by code point. */
export const fileOrder = (a, b) => comparePy(a.toLowerCase(), b.toLowerCase()) || comparePy(a, b);

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
        if (props.type === "review-record") repo.records.set(String(props.record_id), { id: String(props.record_id), file, props, body });
      });
      onProgress(Math.min(i + BATCH, files.length), files.length);
    }
    return repo;
  }

  /** Records in record-id order. */
  sortedRecords() {
    return [...this.records.values()].sort((a, b) => comparePy(a.id, b.id));
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
      const r = this.records.get(id);
      await this.folder.writeText(r.file, recordText(r));
    }
    this.#changed.clear();
    return ids.length;
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
