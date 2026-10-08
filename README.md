# PRISMA Studio

A workbench for scoping reviews (PRISMA-ScR) that runs in the browser and keeps every review in a folder on your own PC: records as Markdown notes, searches as CSV, full texts as PDFs. Nothing is uploaded. The folders open in Obsidian and work with Claude Code.

**Status:** phase 1 — porting the review engine from Python (Review Studio in the author's Obsidian vault) to JavaScript, module by module, each one tested against the Python version on a real review. See [ARCHITECTURE.md](ARCHITECTURE.md) for the layers and rules.

| Area | Python original | JavaScript | Status |
|---|---|---|---|
| Front matter, CSV, names, matching, duplicate index, RIS/BibTeX/CSV import | `prisma_review.py` (first half) | `src/domain/{frontmatter,csv,names,matching,similarity,importers}.js` | ported, identical on 5,683 records |
| Review folder, import, screening checks, sample sheets, PRISMA counts, κ, flow report | `prisma_review.py` (second half) | `src/domain/…`, `src/services/…` | next |
| Stages, protocol, amendments, charting, snowballing, OpenAlex | `review_stages.py` | | to do |
| Local PDF finder | `local_pdfs.py` | (pdf.js) | to do |

## Develop

```
npm test                 # unit tests (fast, no Python)
npm run check            # architecture: layers import only what they may
PRISMA_PY="<folder with prisma_review.py>" REVIEW_DIR="<… records folder>" npm run test:parity
```

Requires Node 20+; the parity tests also need Python 3 and a review folder (review data is never part of this repo).
