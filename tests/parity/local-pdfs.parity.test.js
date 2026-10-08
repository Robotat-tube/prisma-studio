// The PDF finder (pdf.js) finds at least the matches the Python finder (pypdf) finds, in a folder of PDFs.
// The two libraries extract text a little differently, so the JavaScript result may hold extra matches;
// every DOI and title match Python found must be found, for the same PDF.
//   PDF_DIR=<folder of PDFs> together with PRISMA_PY and REVIEW_DIR
import { test } from "node:test";
import assert from "node:assert/strict";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { pythonReference, REVIEW, skipWithoutReview } from "./helpers.js";
import { nodeFolder } from "../../src/adapters/node-folder.js";
import { pdfjsText } from "../../src/adapters/pdfjs-text.js";
import { ReviewRepository } from "../../src/services/review-repository.js";
import { recordsWithoutFullText, scanForPdfs } from "../../src/services/local-pdfs.js";

const PDF_DIR = process.env.PDF_DIR;

test("the PDF finder finds Python's matches in a folder of PDFs", { skip: skipWithoutReview || (!PDF_DIR && "set PDF_DIR"), timeout: 900_000 }, async () => {
  const ref = pythonReference("local_pdfs_ref.py", PDF_DIR);
  const repo = await ReviewRepository.open(nodeFolder(REVIEW), { today: () => "", now: () => "" }, { name: "r", recordsPath: "" });
  const need = await recordsWithoutFullText(repo);
  assert.equal(need.size, ref.records, "records without a full text");
  const result = await scanForPdfs(nodeFolder(PDF_DIR), need, pdfjsText(pdfjs));
  assert.equal(result.pdfs, ref.pdfs, "PDFs found");
  const js = new Map(result.matches.map(m => [m.record_id, m]));
  const missing = ref.matches.filter(m => m.how !== "likely").filter(m => js.get(m.record_id)?.pdf !== m.pdf);
  assert.deepEqual(missing.map(m => `${m.record_id} ${m.how} ${m.pdf}`), [], "certain matches Python found");
  const extra = result.matches.filter(m => !ref.matches.some(p => p.record_id === m.record_id));
  console.log(`python ${ref.matches.length} matches, javascript ${result.matches.length} (${extra.length} extra: ${extra.map(m => `${m.record_id} ${m.how}`).join(", ") || "none"})`);
});
