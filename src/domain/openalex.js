/**
 * OpenAlex works as review entries: the free OpenAlex API provides pilot counts, snowballing and
 * open-access links. Requests themselves go through services/openalex.js.
 * @module domain/openalex
 */
import { makeEntry } from "./importers.js";
import { comparePy } from "./pytext.js";

export const API = "https://api.openalex.org";
export const WORK_FIELDS = "id,doi,title,publication_year,authorships,primary_location,abstract_inverted_index,referenced_works";

/** Rebuilds an abstract from OpenAlex's inverted index ({word: [positions]}). */
export function abstractFromIndex(inverted) {
  if (!inverted || !Object.keys(inverted).length) return "";
  const at = [];
  for (const [word, positions] of Object.entries(inverted)) for (const i of positions) at.push([i, word]);
  at.sort((a, b) => a[0] - b[0] || comparePy(a[1], b[1]));
  return at.map(([, w]) => w).join(" ");
}

/** An OpenAlex work as an export entry. */
export function workToEntry(w) {
  const source = (w.primary_location ?? {}).source ?? {};
  return makeEntry({
    title: w.title || w.display_name || "",
    authors: (w.authorships ?? []).filter(a => a.author).map(a => a.author.display_name).join("; "),
    year: w.publication_year || "", journal: source.display_name || "", doi: w.doi || "",
    url: w.doi || w.id || "", abstract: abstractFromIndex(w.abstract_inverted_index),
  });
}

/** "https://openalex.org/W123" → "W123" */
export const shortId = id => String(id).split("/").pop();
