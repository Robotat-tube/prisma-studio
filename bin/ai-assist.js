#!/usr/bin/env node
/**
 * Command line for AI assistants (the skills in .claude/skills/review-*). Same commands as the Python tool:
 *
 *   node bin/ai-assist.js --review "<… records folder or review name>" context screening [--limit 40]
 *   node bin/ai-assist.js --review "…" suggest SUGGESTIONS.json --model "claude-…" [--stage ft]
 *   node bin/ai-assist.js --review "…" context fulltext|reviewer|retrieval|charting [--limit N]
 *   node bin/ai-assist.js --review "…" r2 DECISIONS.json --model "…"
 *   node bin/ai-assist.js --review "…" attach R0012 PATH.pdf --model "…"
 *   node bin/ai-assist.js --review "…" chart VALUES.json --model "…"
 *
 * Run it from the folder that holds the review (e.g. the Obsidian vault): paths are shown relative to it,
 * and "99 - Templates" and "98 - Publications" there are used when present.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { nodeFolder } from "../src/adapters/node-folder.js";
import { emptyLibrary, openLibrary } from "../src/services/library.js";
import { ReviewRepository } from "../src/services/review-repository.js";
import { loadState } from "../src/services/review-state.js";
import { aiAttach, aiChart, aiContext, aiSecondReviewer, aiSuggest } from "../src/services/ai-assist.js";
import { ReviewError } from "../src/services/review-commands.js";

const root = process.cwd();
const posix = p => p.split("\\").join("/");

/** A review given as its records folder, or by name (the "<name> records" folder somewhere below root). */
function findReview(review) {
  const direct = isAbsolute(review) ? review : resolve(root, review);
  if (existsSync(direct) && statSync(direct).isDirectory()) return direct;
  const want = `${review} records`;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith(".") || e.name === "node_modules") continue;
      const p = join(dir, e.name);
      if (e.name === want) return p;
      stack.push(p);
    }
  }
  throw new ReviewError(`Review "${review}" not found below ${root}.`);
}

const fail = msg => { console.error(`ai_assist: ${msg}`); process.exit(1); };
const readJson = path => { try { return JSON.parse(readFileSync(path, "utf8")); } catch (e) { return fail(`cannot read ${path}: ${e.message}`); } };

async function main() {
  const { values: opt, positionals: [cmd, ...rest] } = parseArgs({
    allowPositionals: true,
    options: { review: { type: "string", default: "Project 2 review" }, limit: { type: "string", default: "40" },
      model: { type: "string" }, stage: { type: "string", default: "ta" } },
  });
  const dir = findReview(opt.review);
  const name = basename(dir).replace(/ records$/, "");
  const template = join(root, "99 - Templates", "Review Record Template.md");
  const clock = { today: () => new Date().toISOString().slice(0, 10), now: () => new Date().toISOString().slice(0, 16).replace("T", " ") };
  const repo = await ReviewRepository.open(nodeFolder(dir), clock, {
    name, recordsPath: posix(relative(root, join(dir, "08 - Records"))),
    template: existsSync(template) ? readFileSync(template, "utf8").replace(/\r\n?/g, "\n") : "",
  });
  const st = await loadState(repo.folder);
  const libraryDir = join(root, "98 - Publications");
  const library = existsSync(libraryDir) ? await openLibrary(nodeFolder(libraryDir)) : emptyLibrary();
  const rel = p => { const full = join(dir, p); const r = relative(root, full); return posix(r.startsWith("..") || isAbsolute(r) ? full : r); };
  const needModel = () => opt.model || fail("--model is required");

  if (cmd === "context") console.log(JSON.stringify(await aiContext(repo, st, rest[0], { limit: Number(opt.limit), rel }), null, 1));
  else if (cmd === "suggest") {
    const { message, skipped } = await aiSuggest(repo, st, readJson(rest[0]), { model: needModel(), stage: opt.stage });
    console.log([message, ...skipped.map(s => "  skipped " + s)].join("\n"));
  } else if (cmd === "r2") console.log(await aiSecondReviewer(repo, st, readJson(rest[0]), { model: needModel(), library }));
  else if (cmd === "attach") console.log(await aiAttach(repo, st, rest[0], new Uint8Array(readFileSync(rest[1])), { model: needModel() }));
  else if (cmd === "chart") console.log((await aiChart(repo, st, readJson(rest[0]), { model: needModel() })).join("\n"));
  else fail("command: context | suggest | r2 | attach | chart");
}

main().catch(e => (e instanceof ReviewError ? fail(e.message) : Promise.reject(e)));
