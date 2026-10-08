// Start of PRISMA Studio in the browser: checks the browser, loads help texts, templates and pdf.js, shows
// the start screen (recent reviews, open a folder, new review), then loads the Review Studio page.
import * as pdfjs from "pdfjs";
import { Backend } from "../src/ui/backend.js";
import { forgetReview, recentReviews, rememberReview } from "../src/adapters/browser-store.js";

pdfjs.GlobalWorkerOptions.workerSrc = import.meta.resolve("pdfjs/worker");

const $ = s => document.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.flat().filter(k => k != null && k !== false));
  return e;
};
const button = (label, onclick, cls = "") => el("button", { className: `btn ${cls}`, onclick, type: "button" }, label);
const say = (text, kind = "") => $("#startBody").querySelector(".start-msg")?.replaceChildren(el("span", { className: kind }, text));
const remember = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

// ------------------------------------------------------------------ the browser must be able to open folders
if (!("showDirectoryPicker" in window)) {
  $("#startBody").replaceChildren(el("div", { className: "callout" },
    "This browser cannot open folders on your PC. Use Google Chrome or Microsoft Edge on a computer."));
  throw new Error("File System Access API not available");
}

const text = path => fetch(new URL(path, import.meta.url)).then(r => r.text());
const backend = new Backend({
  help: await fetch(new URL("help.json", import.meta.url)).then(r => r.json()),
  templates: { record: await text("templates/Review Record Template.md"), publication: await text("templates/Publication Template.md") },
  pdfjs,
});
window.backend = backend;

// ------------------------------------------------------------------ opening a review

async function openReview(entry) {
  const started = performance.now();
  say(`Opening ${entry.name}…`);
  await backend.open(entry, { onProgress: (done, total) => say(`Reading notes: ${done.toLocaleString()} of ${total.toLocaleString()}…`) });
  say(`Preparing the page (${((performance.now() - started) / 1000).toFixed(1)} s so far)…`);
  remember("review", entry.name);
  $("#start").hidden = true;
  $("#app").hidden = false;
  await import("./review-studio.js");
  $("#btnReviewSettings").onclick = reviewSettings;
}

/** A new review: a folder "<name> records" inside the folder the user picks. */
async function newReview() {
  const name = prompt("Name of the review (e.g. 'Repairability review'):")?.trim();
  if (!name) return;
  const parent = await window.showDirectoryPicker({ id: "parent", mode: "readwrite" });
  const handle = await parent.getDirectoryHandle(`${name} records`, { create: true });
  await openReview(await rememberReview(handle, { recordsPath: `${name} records/08 - Records` }));
}

async function openFolder() {
  const entry = await backend.pickFolder();
  say(`Checking "${entry.name}"…`);
  if (!(await Backend.isReviewFolder(entry.handle))
    && !confirm(`"${entry.name}" has no review files yet (no 08 - Records, 07 - Searches.csv or review_state.json). Start a new review in it?`)) return;
  await openReview(entry);
}

// ------------------------------------------------------------------ review settings (Obsidian, library)

async function reviewSettings() {
  const entry = backend.entry;
  const s = { ...(entry.settings ?? {}) };
  const vault = el("input", { type: "text", value: s.vault ?? "", placeholder: "e.g. My research vault" });
  const path = el("input", { type: "text", value: (s.recordsPath ?? `${entry.name}/08 - Records`).replace(/\/08 - Records$/, ""), placeholder: entry.name });
  const lib = el("span", { className: "muted" }, s.library ? s.library.name : "none");
  const dialog = el("dialog", { className: "modal" },
    el("div", { className: "mh" }, "Review settings"),
    el("div", { className: "mb stack" },
      el("label", { className: "field" }, el("span", {}, "Obsidian vault name (to open notes in Obsidian)"), vault),
      el("label", { className: "field" }, el("span", {}, "Path of this review folder inside the vault"), path),
      el("div", { className: "row" }, el("span", {}, "Library folder (publication notes): "), lib,
        button("Choose…", async () => { s.library = await window.showDirectoryPicker({ id: "library", mode: "readwrite" }); lib.textContent = s.library.name; }, "sm"),
        button("None", () => { delete s.library; lib.textContent = "none"; }, "sm ghost"))),
    el("div", { className: "mf" },
      button("Cancel", () => dialog.close(), ""),
      button("Save", async () => {
        Object.assign(s, { vault: vault.value.trim(), recordsPath: `${path.value.trim() || entry.name}/08 - Records` });
        await backend.open(await rememberReview(entry.handle, s));
        dialog.close();
        location.reload();
      }, "primary")));
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
}

// ------------------------------------------------------------------ start screen

async function startScreen() {
  const recent = await recentReviews();
  const list = recent.map(r => el("div", { className: "recent" },
    button(`▶ ${r.name}`, () => openReview(r).catch(e => say(e.message, "err")), "primary"),
    el("span", { className: "muted small" }, new Date(r.opened).toLocaleDateString()),
    button("Forget", async () => { await forgetReview(r.id); startScreen(); }, "sm ghost")));
  $("#startBody").replaceChildren(...[
    list.length ? el("div", { className: "stack" }, el("h3", {}, "Continue"), ...list) : null,
    el("div", { className: "row start-actions" },
      button("📂 Open a review folder…", () => openFolder().catch(e => e.name !== "AbortError" && say(e.message, "err")), list.length ? "" : "primary"),
      button("＋ New review…", () => newReview().catch(e => e.name !== "AbortError" && say(e.message, "err")), "")),
    el("p", { className: "start-msg small muted" }, "Chrome or Edge asks once per visit before the app may use a folder."),
  ].filter(Boolean));
}

startScreen();
