/**
 * Publication notes in the library (`NNN - Year - Authors - Title.md`), created from a finished review's
 * included records.
 * @module domain/publications
 */
import * as frontmatter from "./frontmatter.js";
import { chars, strip } from "./pytext.js";

const FORBIDDEN = /[\\/:*?"<>|#^[\]]/g;

/** "Liu, Z.; Zhong, P.; Liu, H." → "Liu et al."; two authors → "A & B"; none → "Anon". */
export function shortAuthors(authors) {
  const names = String(authors || "").split(/;| and /).filter(a => strip(a)).map(a => strip(a.split(",")[0]))
    .filter(Boolean).map(x => x.replace(FORBIDDEN, ""));
  if (!names.length) return "Anon";
  return names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} & ${names[1]}` : `${names[0]} et al.`;
}

/** Title for a file name: forbidden characters removed, cut at a word boundary before 90 characters. */
export function fileTitle(title) {
  const t = strip(String(title).replace(FORBIDDEN, ""));
  const c = chars(t);
  const cut = c.length > 90 ? c.slice(0, 90).join("").replace(/ [^ ]*$/, "") : t;
  return cut.replace(/[ .-]+$/, "");
}

/** The next library index: one more than the highest `index` of any publication note. */
export function nextIndex(notes) {
  const used = [...notes.values()].map(p => String(p.index || "")).filter(s => /^\d+$/.test(s)).map(Number);
  return Math.max(0, ...used) + 1;
}

/** Text after "## <name>" up to the next "## " heading, trimmed. */
const section = (body, name) => strip(new RegExp(`## ${name}\\s*\\n([\\s\\S]*?)(?=\\n## |$(?![\\s\\S]))`).exec(body)?.[1] ?? "");

/**
 * A publication note for an included record, from the publication template.
 * @param {object} p
 * @param {import("./frontmatter.js").Properties} p.record record properties
 * @param {string} p.recordBody record note text after its properties
 * @param {number} p.index library index for the new note
 * @param {string} p.reviewName @param {string} p.reviewLink @param {string} p.template text of the publication template
 * @returns {{stem: string, props: import("./frontmatter.js").Properties, body: string}}
 */
export function newPublicationNote({ record: f, recordBody, index, reviewName, reviewLink, template }) {
  const [templateProps, templateBody] = frontmatter.parse(template);
  const stem = `${String(index).padStart(3, "0")} - ${f.year || "n.d."} - ${shortAuthors(f.authors)} - ${fileTitle(f.title)}`;
  const props = { ...templateProps, type: "publication", index, authors: f.authors ?? "", year: f.year ?? "", title: f.title,
    journal: f.journal ?? "", doi: f.doi ?? "", url: f.url ?? "", pdf: "", status: "read", added_by: reviewLink,
    candidate_in: [], included_in: [], category: [], tags: [] };
  let body = templateBody.replaceAll("{{title}}", () => f.title)
    .replace("## Abstract\n", () => `## Abstract\n\n${section(recordBody, "Abstract")}\n`)
    .replace("## Keywords\n", () => `## Keywords\n\n${section(recordBody, "Keywords")}\n`);
  // anything the reviewer wrote in the record beyond title, abstract and keywords
  const extra = recordBody.split(/\n(?=## )/).map(strip).filter(x => x.startsWith("## ") && !/^## (Abstract|Keywords)\b/.test(x));
  if (extra.length) body += `\n## Notes from ${reviewName}\n\n` + extra.map(x => x.replace("## ", "### ")).join("\n\n") + "\n";
  return { stem, props, body };
}
