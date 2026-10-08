# PRISMA Studio

A workbench for scoping reviews (PRISMA-ScR) that runs in the browser and keeps every review in a folder on your own PC: records as Markdown notes, searches as CSV, full texts as PDFs. Nothing is uploaded. The folders open in Obsidian and work with Claude Code.

**Status:** phase 1 (engine) is done: the Python tool is ported and tested against it. Phase 2 (browser app) works: start screen, open or create a review folder, the full Review Studio page running on the engine in the browser. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Run it

Double-click `Start PRISMA Studio.cmd`: it installs what is needed on first start, starts the app and opens it in Chrome or Edge (needs Node.js). Or by hand:

```
npm install
npm run serve            # then open http://localhost:8770/web/ in Chrome or Edge
```

**Offline.** After the first visit the browser keeps a copy of the app (`web/sw.js`), so http://localhost:8770/web/ opens without the server or a network. Chrome and Edge can also install it as an app (install icon in the address bar). Review folders are never copied; only searching OpenAlex needs the internet.

**Opening a review** shows how long it took (reading the folder, showing the page); the numbers are also in `window.openTiming`.

To publish: `npm run build` writes `dist/` (the page, the engine and a copy of pdf.js); publish `dist/` with GitHub Pages, Cloudflare Pages or Netlify. It is a static site: nothing runs on the server and no review data leaves the user's PC.

Open a review folder (the "… records" folder) or start a new review. *Settings → Review settings* sets the Obsidian vault (to open notes in Obsidian) and an optional library folder for publication notes.

| Area | Python original | JavaScript | Status |
|---|---|---|---|
| Front matter, CSV, names, matching, duplicate index, RIS/BibTeX/CSV import | `prisma_review.py` (first half) | `src/domain/{frontmatter,csv,names,matching,similarity,importers}.js` | ported, identical on 5,683 records |
| Review folder, import, add, screening checks, sample sheets (same seeds), second-reviewer import, PRISMA counts, κ, flow report, library sync | `prisma_review.py` (second half) | `src/domain/{records,screening,agreement,flow,sampling,pyrandom,notes}.js`, `src/services/{review-repository,review-commands,library}.js` | ported; a six-command sequence on a copy of Project 2 writes identical files |
| Stages, review state, protocol (write, lock, checks), amendments, AI modes, search strings, pilots, OpenAlex, snowballing, retrieval, charting, checklist, exports, kept papers to library | `review_stages.py` | `src/domain/{stages,ai-steps,queries,protocol,progress,stage-notes,openalex,publications}.js`, `src/services/{review-state,stage-actions,openalex-client,library}.js` | ported; a 20-step run on a copy of Project 2 writes identical files (OpenAlex answers replayed) |
| Review Studio actions (every button: concepts, strings, protocol text, reasons, test set, decisions, AI batches, pre-sort, record fields, charting form, checklist, exports, samples, sync, library) | `review_server.py` (`act`) | `src/services/review-session.js` (`ReviewSession`) | ported; 34 actions on a copy of Project 2 give the same messages and files |
| Local PDF finder | `local_pdfs.py` (pypdf) | `src/domain/pdf-matching.js`, `src/services/local-pdfs.js`, `src/adapters/pdfjs-text.js` (pdf.js) | ported; same 19 matches as Python in 152 library PDFs (also reads letter-spaced author names) |
| AI-assist command line for the skills (context, suggestions, blind second reviewer, fetched PDFs, charting prefill; refuses when the review switched the AI off) | `ai_assist.py` | `src/services/ai-assist.js`, `bin/ai-assist.js` | ported; 10 commands on a prepared copy give the AI the same JSON and write the same files |

The skills can call `node bin/ai-assist.js` (same commands and options as `ai_assist.py`) from the folder that holds the review.

## Develop

```
npm test                 # unit tests (fast, no Python)
npm run check            # architecture: layers import only what they may
PRISMA_PY="<folder with prisma_review.py>" REVIEW_DIR="<… records folder>" PDF_DIR="<folder of PDFs>" npm run test:parity
```

Requires Node 20+; the parity tests also need Python 3 and a review folder (review data is never part of this repo).
