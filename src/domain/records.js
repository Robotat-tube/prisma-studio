/**
 * Review records: one note per unique paper, with its screening properties. Creating a record from an
 * export entry, merging a duplicate into it, and reading its abstract.
 * @module domain/records
 */
import * as frontmatter from "./frontmatter.js";
import { recordName } from "./names.js";
import { strip } from "./pytext.js";
import { NO_ABSTRACT } from "./vocabulary.js";

/**
 * @typedef {object} ReviewRecord
 * @property {string} id                 "R0001"
 * @property {string} file               note path inside the review folder, "08 - Records/R0001 - ….md"
 * @property {import("./frontmatter.js").Properties} props
 * @property {string} body               note text after the properties
 */

export const RECORDS_DIR = "08 - Records";

/** The next free record id after `count` records ("R0001", "R0002", …). */
export function nextRecordId(existingIds) {
  let n = existingIds.size + 1;
  while (existingIds.has(`R${String(n).padStart(4, "0")}`)) n++;
  return `R${String(n).padStart(4, "0")}`;
}

const fill = (template, values) =>
  Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{{${key}}}`, () => value), template);

/**
 * A new record for an export entry. Properties and body follow the record template (if given): its
 * properties come first, in its order; `{{title}}`, `{{abstract}}` and `{{keywords}}` are filled in.
 * @param {object} p
 * @param {string} p.id @param {import("./importers.js").Entry} p.entry @param {string} p.reviewLink "[[Review]]"
 * @param {string} p.sourceId "S01" @param {string|null} p.publication library note matching the paper
 * @param {string} [p.template] text of the record template note
 * @returns {ReviewRecord}
 */
export function createRecord({ id, entry: e, reviewLink, sourceId, publication, template = "" }) {
  const [templateProps, templateBody] = template ? frontmatter.parse(template) : [{}, ""];
  const own = {
    type: "review-record", review: reviewLink, record_id: id,
    title: e.title, authors: e.authors, year: e.year, journal: e.journal,
    doi: e.doi, url: e.url || (e.doi ? `https://doi.org/${e.doi}` : ""),
    language: e.language ?? "",
    sources: [sourceId], publication: publication ? `[[${publication}]]` : "",
    ta_decision: "pending", ta_reason: "", ft_decision: "", ft_reason: "", pdf_status: "",
    screener: "", screened_on: "", notes: "",
    sample_ta: false, r2_ta_decision: "", r2_ta_reason: "",
    sample_ft: false, r2_ft_decision: "", r2_ft_reason: "",
  };
  const abstract = e.abstract || NO_ABSTRACT;
  let body;
  if (strip(templateBody)) body = fill(templateBody, { title: e.title, abstract, keywords: e.keywords ?? "" });
  else {
    body = `\n# ${e.title}\n\n## Abstract\n\n${abstract}\n`;
    if (e.keywords) body += `\n## Keywords\n\n${e.keywords}\n`;
  }
  return { id, file: `${RECORDS_DIR}/${recordName(id, e.authors, e.year, e.title)}.md`, props: { ...templateProps, ...own }, body };
}

/**
 * Adds a duplicate's source to an existing record and fills its empty DOI, journal, URL and abstract.
 * @param {ReviewRecord} record @param {import("./importers.js").Entry} e @param {string} sourceId
 * @returns {ReviewRecord} the updated record (the input is not changed)
 */
export function mergeDuplicate(record, e, sourceId) {
  const props = { ...record.props };
  if (!(props.sources ?? []).includes(sourceId)) props.sources = [...(props.sources || []), sourceId];
  for (const k of ["doi", "journal", "url"]) if (!props[k] && e[k]) props[k] = e[k];
  const body = e.abstract && record.body.includes(NO_ABSTRACT) ? record.body.replaceAll(NO_ABSTRACT, () => e.abstract) : record.body;
  return { ...record, props, body };
}

/** Everything after the "## Abstract" heading, trimmed (as written to the second reviewer's sheet). */
export const textAfterAbstractHeading = body => {
  const at = body.indexOf("## Abstract");
  return strip(at < 0 ? body : body.slice(at + "## Abstract".length));
};

/** The note text of a record. */
export const recordText = record => frontmatter.serialize(record.props) + record.body;
