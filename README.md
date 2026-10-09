# PRISMA Studio

A workbench for scoping reviews (PRISMA-ScR) that runs in the browser and keeps every review in a folder on your own PC: records as Markdown notes, searches as CSV, full texts as PDFs. Nothing is uploaded. The folders open in Obsidian and work with Claude Code.

**Online:** https://robotat-tube.github.io/prisma-studio/ (Chrome or Edge). See [ARCHITECTURE.md](ARCHITECTURE.md) for how the code is organised.

## Run it

Double-click `Start PRISMA Studio.cmd`: it installs what is needed on first start, starts the app and opens it in Chrome or Edge (needs Node.js). Or by hand:

```
npm install
npm run serve            # then open http://localhost:8770/web/ in Chrome or Edge
```

Open a review folder (the "… records" folder) or start a new review. *Settings → Review settings* sets the Obsidian vault (to open notes in Obsidian) and an optional library folder for publication notes.

**Offline.** After the first visit the browser keeps a copy of the app (`web/sw.js`), so it opens without the server or a network. Chrome and Edge can also install it as an app (install icon in the address bar). Review folders are never copied; only searching OpenAlex needs the internet.

**Opening a review** shows how long it took (reading the folder, showing the page); the numbers are also in `window.openTiming`.

**Changes made elsewhere** are kept: a note edited in Obsidian is merged when the app saves that record, and the app re-reads the review when Claude (or another program) changed it.

## What it does

- **Planning:** idea log, research questions (PCC), concepts and search terms, search strings per database, pilots, protocol (write, lock, register, amendments).
- **Searching:** import RIS / BibTeX / CSV exports with duplicate detection, OpenAlex searches, snowballing rounds.
- **Screening:** title/abstract and full-text screening with keyboard shortcuts, exclusion reasons from the screening guide, decision checks, a blind second-reviewer sample with Cohen's κ.
- **Full texts:** retrieval queue, matching PDFs from your own folders, attaching PDFs.
- **Charting and reporting:** charting form, critical appraisal, PRISMA flow diagram, PRISMA-ScR checklist, report draft and exports.
- **AI assistance (optional, per step):** the skills in `.claude/skills/` let Claude Code pre-screen, fetch full texts, act as blind second reviewer or prefill charting. Claude only suggests; you confirm every decision, and each AI action is logged with the model.

The skills run `node bin/ai-assist.js` from this folder; `--review` takes a review's name or the full path of its "… records" folder.

## Publish

`npm run build` writes `dist/` (the page, the engine and a copy of pdf.js). It is a static site: nothing runs on the server and no review data leaves the user's PC. Every push to `main` builds and publishes it on GitHub Pages (`.github/workflows/pages.yml`).

## Develop

```
npm test                 # unit tests
npm run check            # architecture: layers import only what they may
node scripts/bench-open.js "<copy of a … records folder>"   # how fast a review opens
```

Requires Node 20+. Review data is never part of this repo.
