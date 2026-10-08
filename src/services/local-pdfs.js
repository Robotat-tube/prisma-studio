/**
 * Finding full texts already on the PC: scans a folder (and its subfolders) for PDFs that match records
 * still waiting for a full text. The reviewer confirms the matches; confirmed ones are copied into the
 * review under the record's name.
 * @module services/local-pdfs
 */
import { matchPdfs, summarizePdf } from "../domain/pdf-matching.js";
import { FULLTEXT_DIR } from "../domain/stages.js";

const MAX_BYTES = 80 * 2 ** 20;

/** Every PDF in a folder and its subfolders, as paths relative to it, in a stable order. */
export async function listPdfs(folder, dir = "") {
  const out = [];
  for (const name of await folder.list(dir)) {
    const path = dir ? `${dir}/${name}` : name;
    if (await folder.isDirectory(path)) out.push(...await listPdfs(folder, path));
    else if (name.toLowerCase().endsWith(".pdf")) out.push(path);
  }
  return out;
}

/** Records that passed title/abstract screening and have no full text in the review yet. */
export async function recordsWithoutFullText(repo) {
  const out = new Map();
  for (const r of repo.records.values()) {
    if (!["include", "unsure"].includes(r.props.ta_decision)) continue;
    const pdf = `${FULLTEXT_DIR}/${r.file.split("/").pop().replace(/\.md$/, "")}.pdf`;
    if (!(await repo.folder.exists(pdf))) out.set(r.id, r.props);
  }
  return out;
}

/**
 * Scans a folder of PDFs for the records that still need a full text.
 * @param {import("../ports/folder.js").Folder} pdfFolder
 * @param {Map<string, import("../domain/frontmatter.js").Properties>} records
 * @param {import("../ports/pdf-text.js").PdfText} pdfText
 * @param {object} [options]
 * @param {Map<string, {text: string, dois: string[]}>} [options.cache] summaries by path, kept between scans
 * @param {(done: number, total: number) => void} [options.onProgress]
 */
export async function scanForPdfs(pdfFolder, records, pdfText, { cache = new Map(), onProgress = () => {} } = {}) {
  const paths = await listPdfs(pdfFolder);
  const pdfs = [];
  for (const [i, path] of paths.entries()) {
    if (!cache.has(path)) {
      const bytes = await pdfFolder.readBytes(path);
      let raw = "";
      if (bytes.length < MAX_BYTES) {
        try { raw = await pdfText.firstPages(bytes, 2); } catch { /* damaged, encrypted or scanned: no text */ }
      }
      cache.set(path, summarizePdf(raw));
    }
    pdfs.push({ path, name: path.split("/").pop(), ...cache.get(path) });
    onProgress(i + 1, paths.length);
  }
  return { folder: pdfFolder.name, pdfs: paths.length, records: records.size, matches: matchPdfs(records, pdfs) };
}
