# PRISMA Scoping Review Studio

**A scoping-review workbench (PRISMA-ScR) that runs in your browser and keeps every review in a folder on your own PC.**

**[▶ Open it in your browser](https://robotat-tube.github.io/prisma-studio/)** · **[💾 Download for Windows, Mac and Linux](https://github.com/Robotat-tube/prisma-studio/releases/latest/download/prisma-scoping-review-studio.zip)** · Chrome or Edge on a computer

PRISMA Scoping Review Studio walks you through a scoping review from the first idea to the PRISMA flow diagram: questions, search strings, protocol, database imports, screening, full texts, charting and the report. Your review is a plain folder of Markdown notes, CSV tables and PDFs: nothing is uploaded, there is no account, and the folder opens in Obsidian or any text editor.

![PRISMA Scoping Review Studio: screening a record, with the review's stages in the sidebar](docs/screenshot.png)

*Screening in PRISMA Scoping Review Studio (example data). Search terms are highlighted in the abstract; I / U / E decide.*

![The app tour highlighting the 15 stages](docs/tour.png)

*The 1-minute app tour, started from the Homepage.*

**Highlights**

- 🧭 **Guided, step by step:** 15 stages from idea to report, each with what to do, where it is saved, and help with a worked example.
- 🔒 **Your files, your PC:** no account, no upload, no database. A review is a folder of Markdown, CSV and PDFs.
- 🟣 **Opens in Obsidian:** a review folder is an Obsidian vault as it is, with the screening and charting tables as `.base` files.
- 🤖 **AI only if you want it:** Claude can pre-screen, fetch PDFs, be the blind second reviewer or prefill charting. It suggests; you confirm.
- 📶 **Works offline** once opened, or install it as an app.

## Contents

- [Getting started](#getting-started)
- [Three ways to use it](#three-ways-to-use-it)
- [The 15 stages](#the-15-stages)
- [Your review folder](#your-review-folder)
- [AI assistance with Claude (optional)](#ai-assistance-with-claude-optional)
- [Privacy and data safety](#privacy-and-data-safety)
- [Questions and problems](#questions-and-problems)
- [For developers](#for-developers)

## Getting started

1. Open **https://robotat-tube.github.io/prisma-studio/** in **Chrome or Edge** on a computer.
2. You start on the **Homepage**: a one-minute animated walk through a review, and the **🎓 tour** of the screen.
3. Pick a stage in the sidebar. Your work starts as a **draft** kept in the browser, so you can begin with your idea and research questions right away.
4. When you want to keep it, press **💾 Save to a folder…** in the bar at the top, give the review a name and pick a place on your PC. From then on every change is written to that folder.
5. Next time, the same bar offers **📂 Open a review folder…** and your recent reviews. The browser asks once per visit before the app may edit a folder.

Handy: **☰** (or the **[** key) folds the sidebar away while you work; **⚙ Settings** has light/dark, the glossary and the keyboard shortcuts.

## Three ways to use it

| | How | Good for |
|---|---|---|
| 🌐 **In the browser** | Open the [website](https://robotat-tube.github.io/prisma-studio/). | Trying it, everyday use. Always the newest version. |
| 📲 **As an app** | On the website: **⚙ Settings → ⬇ Install as an app** (or the install icon in the address bar). | Its own window and Start-menu icon; works offline; updates itself. |
| 💾 **On your own computer** | [Download the ZIP](https://github.com/Robotat-tube/prisma-studio/releases/latest/download/prisma-scoping-review-studio.zip) and double-click the launcher (below). | Working without the website, keeping a fixed version, using Claude Code with the AI skills, or changing the code. |

### Running the download

You need **[Node.js](https://nodejs.org) 20 or newer** (free; install it once) and **Chrome or Edge**. Unzip the download, then:

| System | Double-click | Notes |
|---|---|---|
| **Windows** | `Start PRISMA Studio.cmd` | If Windows SmartScreen warns, choose *More info → Run anyway*. |
| **Mac** | `Start PRISMA Studio.command` | The first time macOS may block it: **right-click → Open → Open**. |
| **Linux** | `start-prisma-studio.sh` | Or run `./start-prisma-studio.sh` in a terminal (if needed: `chmod +x start-prisma-studio.sh`). |

The launcher starts the app on your computer and opens it at **http://localhost:8770/web/**. Keep its window open while you work; close it (or press Ctrl+C) to stop. Your reviews are not inside the app's folder: they are wherever you saved them, so you can replace the app with a newer download at any time.

## The 15 stages

| # | Stage | What you do |
|---:|---|---|
| 0 | Idea *(optional)* | Write down, with dates, what you want to find out and why. |
| 1 | Research questions | Population–Concept–Context and the review questions; every version is kept. |
| 2 | Concepts and terms | One block per concept with all synonyms and spellings, combined with AND. |
| 3 | Search strings | Strings generated per database (Scopus, IEEE Xplore, OpenAlex, …) from the concept table. |
| 4 | Pilot and validation *(optional)* | Trial runs: hit count and how many papers of your test set a string finds. |
| 5 | Protocol | The protocol text, generated from stages 1–4 plus the method sections. |
| 6 | Registration *(optional)* | Freeze the protocol before searching; later changes become logged amendments. |
| 7 | Database searches | Import each export (RIS, BibTeX, CSV) with its exact string and date; duplicates are merged. |
| 8 | Screening | Title/abstract, then full text, with keyboard shortcuts and exclusion reasons. |
| 9 | Second reviewer *(optional)* | A blind sample of ≥ 20 % for a second reviewer, with Cohen's κ. |
| 10 | Full-text retrieval | Find and attach the PDFs (it can match them in your own folders), or mark them not retrieved. |
| 11 | Snowballing *(optional)* | Citation rounds from the included papers until a round adds nothing new. |
| 12 | Data charting | The charting form for every included paper, with page locators. |
| 13 | Critical appraisal *(optional)* | Appraise each included source. |
| 14 | Report | PRISMA flow diagram, PRISMA-ScR checklist, report draft and exports. |

Keyboard shortcuts while screening: **I** include · **U** unsure · **E** exclude · **1–9** reason · **← / →** previous / next.

## Your review folder

A review is one folder named `<review name> records`:

```
Project 2 review records/
├── 00 - Review log.md          every action, dated
├── 00 - Review timeline.md     the review's history in one note
├── 03 - Search strategy.md
├── 05 - Protocol.md
├── 07 - Searches.csv           one row per search: database, string, date, counts
├── 07 - Exports/               the original database exports
├── 08 - Records/               one Markdown note per paper (R0001 - 2024 - Liu et al. - ….md)
├── 08 - Screening guide.md     eligibility criteria and exclusion reasons
├── 09 - Second reviewer/       blind sample sheets (CSV)
├── 10 - Full texts/            the PDFs, named after their record
├── 14 - PRISMA flow.md
├── 14 - PRISMA-ScR checklist.md
└── review_state.json           stages, protocol, settings
```

Each record note keeps its decisions in its properties (`ta_decision`, `ft_decision`, `ta_reason`, …), so you can also browse and filter the review in Obsidian. *Settings → Review settings* links the folder to your Obsidian vault, so notes open there with one click.

## AI assistance with Claude (optional)

Each stage that can use help has an **🤖 AI assistance** card where you choose whether to use it. It is off by default. When it's on, [Claude Code](https://claude.com/claude-code) can:

- **pre-screen** titles and abstracts, or full texts, and suggest a decision with a reason;
- **fetch full texts** (open access first) and attach the PDFs;
- act as a **blind second reviewer** on the sample;
- **prefill the charting form** from the PDFs, with page locators.

Claude only ever *suggests*: you confirm or change every suggestion in PRISMA Scoping Review Studio, each AI action is logged with the model and date, and the protocol's "Use of AI assistance" section is written for you.

How to use it: open the app's folder (the download, or a clone of this repository) in Claude Code, press **📋 Copy prompt** on the AI card and paste it. The skills are in `.claude/skills/`; they work through `node bin/ai-assist.js`, which refuses whenever the review has the AI switched off for that step. Keep PRISMA Scoping Review Studio open next to it: it notices Claude's changes and shows them.

## Privacy and data safety

- **Nothing leaves your PC.** The app is a static web page; your review folder is read and written by your own browser. The only network requests are searches you start yourself (OpenAlex) and loading the app.
- **Your files stay readable.** Plain Markdown, CSV and JSON: no database, no lock-in.
- **Edits made elsewhere are kept.** If you change a note in Obsidian while the app is open, saving that record in the app keeps your edit. If Claude changes the review, the app re-reads it.
- **Tip:** keep the review folder under version control (git) or in a synced folder, so you can always go back.

## Questions and problems

- **"Open a review folder" does nothing / is missing.** Use Chrome or Edge in a normal window on a computer. Firefox, Safari, phones and browser panes inside other apps cannot open folders.
- **The launcher says Node.js is needed.** Install it from https://nodejs.org (the LTS version) and start the launcher again.
- **Port 8770 is already in use.** The app is probably already running: open http://localhost:8770/web/, or close the other launcher window.
- **I don't see the newest version.** The app stores itself for offline use and updates on the next visit; reload the page once more.
- **Something else?** [Open an issue](https://github.com/Robotat-tube/prisma-studio/issues).

## For developers

Run from a clone with `npm install` and `npm run serve` (then open http://localhost:8770/web/), or with the launchers above.

Plain JavaScript (ES modules), no framework and no bundler; the only dependency is [pdf.js](https://mozilla.github.io/pdf.js/) for reading PDFs. The code is split into layers (domain rules, ports, services, adapters, UI). See [ARCHITECTURE.md](ARCHITECTURE.md).

```
npm test                 # unit tests
npm run check            # architecture: each layer imports only what it may
npm run build            # the static site in dist/
node scripts/bench-open.js "<copy of a … records folder>"   # how fast a review opens
node scripts/readme-screenshot.js   # docs/screenshot.png and docs/tour.png, with example data (needs npm run serve)
```

Every push to `main` is tested, built and published on GitHub Pages, and the download ZIP on the [latest release](https://github.com/Robotat-tube/prisma-studio/releases/latest) is rebuilt (`.github/workflows/pages.yml`). Review data is never part of this repository.
