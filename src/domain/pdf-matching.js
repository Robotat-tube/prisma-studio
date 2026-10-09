/**
 * Matching PDFs already on the PC to records still waiting for a full text, before looking online.
 *
 * Most certain first:
 *   doi    the record's DOI appears in the PDF's properties or on its first two pages
 *   title  the record's whole title and its first author's surname appear near the top of the first page
 *   likely most of the title's word pairs appear there, in order, with the first author's surname
 *          (shown for checking, not ticked by default)
 * Short titles ("Design structure matrix") appear on many first pages, so a title never counts without the
 * first author. Nothing is copied here: the reviewer confirms each match.
 * @module domain/pdf-matching
 */
import { normalizeDoi, normalizeTitle } from "./matching.js";
import { compareCodePoints, charCount, splitWords, strip } from "./text-rules.js";

const DOI = /\b10\.\d{4,9}\/[^\s"<>]+/gi;
const RANK = { doi: 3, title: 2, likely: 1 };
const ORDER = { doi: 0, title: 1, likely: 2 };
const TOP = 3000;                // characters of normalised text where the title and authors sit

/**
 * What matching needs from a PDF: its normalised text and the DOIs in it.
 * @param {string} raw properties (title, subject, doi, keywords) and the text of the first two pages
 * @returns {{text: string, dois: string[]}}
 */
export function summarizePdf(raw) {
  const dois = new Set([...raw.matchAll(DOI)].map(m => normalizeDoi(m[0]).replace(/[).,;\]]+$/, "")));
  return { text: [...normalizeTitle(raw)].slice(0, 20000).join(""), dois: [...dois].sort(compareCodePoints) };
}

/** Consecutive word pairs of a title (stop words kept: they fix the order). */
export function titlePairs(title) {
  const words = splitWords(normalizeTitle(title));
  return words.slice(1).map((w, i) => `${words[i]} ${w}`);
}

/** "Bai, Z.-H.; Zhang, S." → "bai"; "Agus Sudjianto; Kevin Otto" → "sudjianto" (normalised). */
export function firstAuthor(authors) {
  const first = strip(String(authors || "").split(";")[0]);
  const name = first.includes(",") ? first.split(",")[0] : (splitWords(first).at(-1) ?? "");
  return normalizeTitle(name);
}

/**
 * @typedef {object} PdfMatch
 * @property {string} record_id @property {string} pdf path of the PDF @property {string} name file name
 * @property {"doi"|"title"|"likely"} how @property {number} score
 */

/**
 * The best PDF for each record.
 * @param {Map<string, import("./frontmatter.js").Properties>} records records still needing a PDF, by id
 * @param {{path: string, name: string, text: string, dois: string[]}[]} pdfs summaries, in scan order
 * @returns {PdfMatch[]} sorted: DOI matches first, then by record id
 */
export function matchPdfs(records, pdfs) {
  const byDoi = new Map([...records].filter(([, p]) => p.doi).map(([id, p]) => [normalizeDoi(p.doi), id]));
  const titles = [...records].map(([id, p]) => [id, normalizeTitle(p.title), titlePairs(p.title), firstAuthor(p.authors)]);
  const best = new Map();
  const offer = (id, pdf, how, score) => {
    const cur = best.get(id);
    if (!cur || RANK[how] > RANK[cur.how] || (RANK[how] === RANK[cur.how] && score > cur.score)) {
      best.set(id, { record_id: id, pdf: pdf.path, name: pdf.name, how, score: Math.round(score * 100) / 100 });
    }
  };
  for (const pdf of pdfs) {
    for (const d of pdf.dois) if (byDoi.has(d)) offer(byDoi.get(d), pdf, "doi", 1);
    if (!pdf.text) continue;
    const top = ` ${[...pdf.text].slice(0, TOP).join("")} `;
    for (const [id, full, pairs, author] of titles) {
      // names set in letter-spaced small capitals come out as "j i a o" from some PDF readers
      if (charCount(author) < 2 || !(top.includes(` ${author} `) || top.includes(` ${[...author].join(" ")} `))) continue;
      if (charCount(full) >= 15 && top.includes(` ${full} `)) offer(id, pdf, "title", 1);
      else if (pairs.length >= 4) {
        const share = pairs.filter(q => top.includes(` ${q} `)).length / pairs.length;
        if (share >= 0.75) offer(id, pdf, "likely", share);
      }
    }
  }
  return [...best.values()].sort((a, b) => ORDER[a.how] - ORDER[b.how] || compareCodePoints(a.record_id, b.record_id));
}
