// Runs the same command sequence with the Python and the JavaScript engine on two copies of a review and
// requires identical files afterwards (line ends normalised). The original review is only read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pythonReference, skipWithoutReview } from "./helpers.js";
import { nodeFolder } from "../../src/adapters/node-folder.js";
import { ReviewRepository } from "../../src/services/review-repository.js";
import { openLibrary } from "../../src/services/library.js";
import * as commands from "../../src/services/review-commands.js";

const WORK = join(tmpdir(), "prisma-studio-parity");

// How the Python tool names itself in the notes it generates
const PYTHON_GENERATOR = {
  path: "95 - Tools/PRISMA review/prisma_review.py",
  rerun: "`prisma_review.py report`",
  commands: "See the header of `95 - Tools/PRISMA review/prisma_review.py`. After a screening session run `report` to refresh [[14 - PRISMA flow]].",
  logBy: "`prisma_review.py`",
};

async function walk(dir, base = dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p, base));
    else out.push(p.slice(base.length + 1).replaceAll("\\", "/"));
  }
  return out.sort();
}

test("import, check, samples, second reviewer and report write the same files as Python", { skip: skipWithoutReview, timeout: 900_000 }, async () => {
  const plan = pythonReference("commands_ref.py", WORK);
  const reviewDir = join(WORK, "js", plan.review);
  const clock = { today: () => plan.today, now: () => `${plan.today} 00:00` };
  const settings = {
    name: plan.review.replace(/ records$/, ""), recordsPath: plan.recordsPath,
    template: await readFile(plan.template, "utf8").then(t => t.replace(/\r\n?/g, "\n")), generator: PYTHON_GENERATOR,
  };
  const library = await openLibrary(nodeFolder(plan.library));
  const open = () => ReviewRepository.open(nodeFolder(reviewDir), clock, settings);   // fresh each step, as Python
  const inputs = join(WORK, "inputs");

  await commands.writeReport(await open(), library);
  await commands.drawSample(await open(), { stage: "ta", fraction: 0.05, seed: 4242, redo: true });
  await commands.importSecondReviewer(await open(), { fileName: "filled sheet.csv", text: await readFile(join(inputs, "filled sheet.csv"), "utf8"), stage: "ta" }, library);
  await commands.importSearch(await open(), {
    fileName: "parity export.ris", bytes: new Uint8Array(await readFile(join(inputs, "parity export.ris"))), database: "Parity DB",
    query: 'TITLE-ABS-KEY("module identification" | PCB)', date: "2026-01-14", filters: "English",
  }, library);
  await commands.addPaper(await open(), { title: "A snowballed paper on modular electronics", authors: "Back, W.", year: "2019", via: "backward from R0001, iteration 1" }, library);
  await commands.drawSample(await open(), { stage: "ft", fraction: 0.1, seed: 99, redo: true });

  const pyDir = join(WORK, "py", plan.review);
  const [pyFiles, jsFiles] = [await walk(pyDir), await walk(reviewDir)];
  assert.deepEqual(jsFiles.filter(f => !pyFiles.includes(f)), [], "files only the JavaScript engine wrote");
  assert.deepEqual(pyFiles.filter(f => !jsFiles.includes(f)), [], "files only the Python engine wrote");
  const differ = [];
  for (const f of pyFiles) {
    const [a, b] = await Promise.all([readFile(join(pyDir, f)), readFile(join(reviewDir, f))]);
    if (a.equals(b)) continue;
    const norm = buf => buf.toString("utf8").replace(/\r\n?/g, "\n");
    const [x, y] = [norm(a), norm(b)];
    if (x === y) continue;
    const xl = x.split("\n"), yl = y.split("\n");
    const i = xl.findIndex((l, k) => l !== yl[k]);
    differ.push(`${f}\n    line ${i + 1}\n    py: ${JSON.stringify(xl[i])?.slice(0, 200)}\n    js: ${JSON.stringify(yl[i])?.slice(0, 200)}`);
  }
  assert.equal(differ.length, 0, `${differ.length} of ${pyFiles.length} files differ:\n` + differ.slice(0, 8).join("\n"));
});
