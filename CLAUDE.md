# PRISMA Studio — notes for Claude

A browser app for scoping reviews (PRISMA-ScR). A review is a folder on the user's PC (`<name> records/`: `08 - Records/*.md`, `07 - Searches.csv`, `review_state.json`, `10 - Full texts/`, …). The app reads and writes that folder through the File System Access API; nothing is uploaded. It is a port of the Python "Review Studio" that lived in the user's Obsidian vault (`Desktop\Modular_Electronics_Obsidian v1`); review folders written by either are compatible.

## Working with the user

- Ask questions and offer next steps as clickable choices (AskUserQuestion, 2–4 options, recommended first).
- After a change: test it, commit and push when the user wants, and offer follow-ups.

## Architecture (see ARCHITECTURE.md; `npm run check` enforces it)

- `src/domain` pure rules (no I/O, dates or randomness) · `src/ports` interfaces (Folder, Clock, Http, PdfText) · `src/services` use cases (`ReviewSession` = every user action) · `src/adapters` platform code (node, memory, browser folder, fetch, pdf.js) · `src/ui` browser backend + view model · `web/` the page (`main.js` start screen, `review-studio.js` the Review Studio page).
- The page calls `window.backend` (src/ui/backend.js) instead of a server.

## Run and test

- `Start PRISMA Studio.cmd` (double-click) or `npm run serve` → http://localhost:8770/web/ — **Chrome or Edge in a normal window**; browser panes inside other apps cannot open folders.
- `npm test` unit tests · `npm run check` architecture · `npm run build` → `dist/` static site.
- Browser automation cannot use the native folder picker: test with the browser's private storage instead (`navigator.storage.getDirectory()` gives a directory handle; `backend.open({handle, name, settings})`).
- Parity tests (`npm run test:parity`) compare with the Python tool, which was removed from the vault on 2026-10-08 (vault commit ea8d7b32). To run them, check the Python tool out of the vault's history (`git -C "<vault>" worktree add <dir> 572cbd29` and use `<dir>/95 - Tools/PRISMA review`) and set `PRISMA_PY`, `REVIEW_DIR` (a **copy** of a review folder), `PDF_DIR`.

## Open items (2026-10-08)

- Test copy of the user's review: `Desktop\PRISMA Studio test\Project 2 review records` (never test on the original in the vault).
- Offline: `web/sw.js` stores the app on first visit (list from `scripts/precache-list.js`, served as `/web/precache.json`); it then opens at http://localhost:8770/web/ without the server. Chrome can install it as an app.
- Not yet: hosting (postponed by the user, 2026-10-08), timing a real 5,683-note review from disk.

## Writing code here

- Write JavaScript with the Write/Edit tools: shell heredocs mangle `\r`, `\n` and ` ` escapes.
- Keep the review-folder format identical to the Python tool's; text rules go through `src/domain/pytext.js`.
