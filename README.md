# PRISMA Studio

A workbench for scoping reviews (PRISMA-ScR) that runs in the browser and keeps every review in a folder on your own PC: records as Markdown notes, searches as CSV, full texts as PDFs. Nothing is uploaded. The folders open in Obsidian and work with Claude Code.

**Status:** phase 1 of the plan — porting the review engine from Python (Review Studio in the author's Obsidian vault) to JavaScript, module by module, each one tested against the Python version on a real review.

| Module | Python original | Status |
|---|---|---|
| `engine/core.js` — front matter, record names, DOI/title matching, duplicate index, RIS/BibTeX/CSV import | `prisma_review.py` (first half) | ported, identical on 5,683 records |
| records: import, sample sheets, PRISMA counts, κ | `prisma_review.py` (second half) | next |
| stages, protocol, amendments, charting, snowballing, OpenAlex | `review_stages.py` | to do |
| local PDF finder | `local_pdfs.py` | to do (pdf.js) |

## Tests

```
npm test
```

Runs the self-contained tests. To compare with the Python engine on a real review folder (the review data is never part of this repo):

```
PRISMA_PY="<folder with prisma_review.py>" REVIEW_DIR="<… records folder>" npm test
```

Requires Node 20+ and, for the comparison, Python 3.
