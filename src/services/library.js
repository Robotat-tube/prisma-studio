/**
 * The optional publication library (e.g. "98 - Publications"): publication notes the reviewer keeps
 * across projects. Used to link new records to known papers, for the search's test set, and to mark which
 * publications a review considered and included (`candidate_in`, `included_in`).
 * @module services/library
 */
import * as frontmatter from "../domain/frontmatter.js";
import { DuplicateIndex, yearOf } from "../domain/matching.js";
import { comparePy } from "../domain/pytext.js";
import { fileOrder } from "./review-repository.js";

/**
 * @typedef {object} Library
 * @property {DuplicateIndex} index                      finds the note name (stem) of a paper
 * @property {Map<string, import("../domain/frontmatter.js").Properties>} notes  by note name
 * @property {import("../ports/folder.js").Folder|null} folder
 */

/** An empty library, for reviews without one. @returns {Library} */
export const emptyLibrary = (folder = null) => ({ index: new DuplicateIndex(), notes: new Map(), folder });

/** Reads every `type: publication` note in the library folder. @returns {Promise<Library>} */
export async function openLibrary(folder) {
  const library = emptyLibrary(folder);
  for (const name of (await folder.list("")).filter(f => f.endsWith(".md")).sort(fileOrder)) {
    const [props] = frontmatter.parse(await folder.readText(name));
    if (props.type !== "publication") continue;
    const stem = name.slice(0, -3);
    library.index.add(stem, props.doi, props.title, yearOf(props.year));
    library.notes.set(stem, props);
  }
  return library;
}

/**
 * Papers the searches must find: publications with `test_in: [[review]]`; if none are marked, every
 * publication with `candidate_in: [[review]]`. @returns {string[]} note names
 */
export function testSet(library, reviewLink) {
  const mentions = v => (Array.isArray(v) || typeof v === "string") && v.includes(reviewLink);   // a list, or text as typed by hand
  const has = key => [...library.notes].filter(([, p]) => mentions(p[key])).map(([stem]) => stem);
  const marked = has("test_in");
  return marked.length ? marked : has("candidate_in");
}

const noteName = link => String(link ?? "").replace(/^[[\]]+|[[\]]+$/g, "");
// Python iterates a property value: a list item by item, a text character by character
const asList = v => (Array.isArray(v) ? v : typeof v === "string" ? [...v] : []).filter(Boolean);

/**
 * What the library should say about this review: `included_in` on the publications of included records,
 * `candidate_in` on every publication a record matched. Candidates are only added, never removed.
 * @param {import("./review-repository.js").ReviewRepository} repo @param {Library} library
 * @returns {{changes: {note: string, key: string, add: boolean, values: unknown[]}[], lacking: string[]}}
 */
export function planLibrarySync(repo, library) {
  const records = [...repo.records.values()];
  const linked = records.filter(r => r.props.publication);
  const included = new Set(linked.filter(r => r.props.ft_decision === "include").map(r => noteName(r.props.publication)));
  const matched = new Set(linked.map(r => noteName(r.props.publication)));
  const changes = [];
  for (const [note, props] of library.notes) {
    const wanted = [["included_in", included.has(note)], ["candidate_in", matched.has(note) || asList(props.candidate_in).includes(repo.link)]];
    for (const [key, want] of wanted) {
      const current = asList(props[key]);
      if (current.includes(repo.link) === want) continue;
      changes.push({ note, key, add: want, values: want ? [...current, repo.link] : current.filter(v => v !== repo.link) });
    }
  }
  const lacking = records.filter(r => r.props.ft_decision === "include" && !r.props.publication)
    .map(r => `${r.id} - ${[...String(r.props.title)].slice(0, 80).join("")}`).sort(comparePy);
  return { changes, lacking };
}

/** Writes a planned sync into the library's notes (only the changed list properties). */
export async function applyLibrarySync(library, repo, { changes }) {
  const byNote = new Map();
  for (const c of changes) byNote.set(c.note, [...(byNote.get(c.note) ?? []), c]);
  for (const [note, list] of byNote) {
    const file = `${note}.md`;
    let text = await library.folder.readText(file);
    for (const c of list) text = frontmatter.replaceList(text, c.key, c.values);
    await library.folder.writeText(file, text);
  }
  if (changes.length) await repo.log("sync", `${changes.length} property change(s) in publication notes`);
  return byNote.size;
}
