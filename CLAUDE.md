# PRISMA Studio — notes for Claude

A browser app for scoping reviews (PRISMA-ScR). A review is a folder on the user's PC (`<name> records/`: `08 - Records/*.md`, `07 - Searches.csv`, `review_state.json`, `10 - Full texts/`, …). The app reads and writes that folder through the File System Access API; nothing is uploaded. Review folders are also plain Obsidian notes.

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

## Open items (2026-10-08)

- Test copy of the user's review: `Desktop\PRISMA Studio test\Project 2 review records` (never test on the original in the vault).
- Offline: `web/sw.js` stores the app on first visit (list from `scripts/precache-list.js`, served as `/web/precache.json`); it then opens at http://localhost:8770/web/ without the server. Chrome can install it as an app.
- Speed on the full review (5,683 notes): `node scripts/bench-open.js "<copy>"` reads it in ~0.6 s; in the browser's private storage it opens in ~2.0 s and a screening click takes ~40 ms. Still to confirm from a real disk folder in the user's Chrome (the app shows the time when opening; `window.openTiming`).
- Outside changes: saving a record merges edits made on disk since it was read (Obsidian); the app re-reads the review when `review_state.json` changed (Claude via `bin/ai-assist.js`), on focus, every 15 s and before each action.
- `bin/ai-assist.js --review` takes a name or a path; a name that fits the test copy and the vault original is refused with both paths.
- Hosting: GitHub Pages from the public repo Robotat-tube/prisma-studio (https://robotat-tube.github.io/prisma-studio/), deployed by `.github/workflows/pages.yml` on every push to main. Pushing to main publishes the site.

## Writing code here

- Write JavaScript with the Write/Edit tools: shell heredocs mangle `\r`, `\n` and ` ` escapes.
- Keep the review-folder format stable (existing reviews must keep opening); text rules go through `src/domain/text-rules.js`.
