# Architecture

PRISMA Studio is a browser app whose data is a folder on the user's PC. The code is split into layers so that the review rules can be tested without a browser, run unchanged in Node and the browser, and stay identical to the Python tool that writes the same folders.

```
            ┌──────────── ui (later) ────────────┐
            │  pages, components, browser shell  │
            └────────────────┬───────────────────┘
                             ▼
┌─ adapters ─┐   ┌──────── services ────────┐
│ node-folder│◄──│ use cases: import search,│
│ memory     │   │ draw sample, write report│
│ browser    │   └─────┬─────────────┬──────┘
└─────┬──────┘         ▼             ▼
      │          ┌── ports ──┐  ┌── domain ──┐
      └─────────►│ Folder,   │  │ pure rules │
     implements  │ Clock     │  │ and formats│
                 └───────────┘  └────────────┘
```

## Layers

| Layer | Folder | Contains | May import |
|---|---|---|---|
| **domain** | `src/domain/` | Pure functions and value objects: front matter, CSV, names, matching, importers, (next) screening checks, PRISMA counts, κ, reports as text. No I/O, no clock, no randomness, no platform APIs. | domain |
| **ports** | `src/ports/` | Interfaces the services need from outside: `Folder` (the review folder), `Clock`. Types only. | domain, ports |
| **services** | `src/services/` | Use cases. Load the review through a `Folder`, call the domain, write the result back. Receive their ports as parameters (dependency injection). | domain, ports, services |
| **adapters** | `src/adapters/` | Implementations of the ports for each platform: Node file system (tests, CLI), in-memory (tests), browser File System Access (UI). | domain, ports, adapters |
| **ui** | `src/ui/` (phase 2) | The page. Calls services only. | services, ports, adapters |

`npm run check` enforces the "may import" column and that domain, ports and services use no platform modules (`node:*`, packages), so they run in the browser as they are.

## Rules

- **Same files as the Python tool.** A review folder is the contract. Anything that writes text the Python tool also writes goes through `domain/pytext.js` (Python-compatible whitespace, line breaks, character counting) and is covered by a parity test.
- **Effects at the edges.** Dates, random seeds and file access are passed in (ports); domain functions return values instead of writing. This keeps them deterministic and testable.
- **One module, one concern.** A module is named after what it is about (`matching`, `importers`), exports a small API, and documents it with JSDoc at the top.
- **Public API.** Code outside `src/` (UI, tools, tests of the API) imports from `src/index.js`.

## Tests

| Kind | Where | Run | Needs |
|---|---|---|---|
| Unit | `tests/unit/` | `npm test` | nothing |
| Parity with Python | `tests/parity/` (+ `ref/*.py` scripts printing the Python result as JSON) | `PRISMA_PY=… REVIEW_DIR=… npm run test:parity` | Python, a real review folder (never committed) |
| Architecture | `scripts/check-architecture.js` | `npm run check` | nothing |

Every ported module gets both: unit tests for its rules, and a parity test against the Python version on Project 2 before the Python version is retired.
