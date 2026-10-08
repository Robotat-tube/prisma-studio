/**
 * Notes the tool generates in the review folder: screening guide, the Obsidian table of the records
 * (08 - Screening.base), the PRISMA flow report (14 - PRISMA flow.md) and rows of the review log.
 * Pure text builders: the services decide when to write them.
 * @module domain/notes
 */
import * as frontmatter from "./frontmatter.js";
import { formatFixed, formatPercent } from "./pytext.js";
import { DEFAULT_FT_REASONS, DEFAULT_TA_REASONS } from "./vocabulary.js";

/**
 * How generated notes name the tool that wrote them.
 * @typedef {object} Generator
 * @property {string} path      written to `generated-by`
 * @property {string} rerun     how to regenerate the PRISMA flow note, e.g. "`prisma_review.py report`"
 * @property {string} commands  last section of the screening guide (where the commands are)
 * @property {string} logBy     who writes the review log, e.g. "`prisma_review.py`"
 * @property {string} stagesBy  `generated-by` of the protocol note
 */

/** @type {Generator} */
export const APP_GENERATOR = Object.freeze({
  path: "PRISMA Studio",
  rerun: "*Report* in PRISMA Studio",
  commands: "Use PRISMA Studio. After a screening session open *Report* to refresh [[14 - PRISMA flow]].",
  logBy: "PRISMA Studio",
  stagesBy: "PRISMA Studio",
});

export const FILES = Object.freeze({
  searches: "07 - Searches.csv",
  exports: "07 - Exports",
  guide: "08 - Screening guide.md",
  base: "08 - Screening.base",
  log: "00 - Review log.md",
  flow: "14 - PRISMA flow.md",
});

const guideBody = commands => `
# Screening guide

> [!warning] Replace the exclusion reasons in the properties above with the criteria of the registered protocol (Step 01) **before** screening starts. Changes after the pilot are protocol amendments: log them.

Screening happens in [[08 - Screening.base]]. Edit the properties in the table; nothing else needs to be touched.

## Title/abstract stage — \`ta_decision\`

| Value | Meaning |
|---|---|
| \`pending\` | not yet screened (set on import) |
| \`include\` | meets the criteria → goes to full text |
| \`unsure\` | cannot decide from title/abstract → goes to full text |
| \`exclude\` | fails a criterion → set \`ta_reason\` to one of \`ta_reasons\` (the code alone, e.g. \`E1\`, is enough) |

## Full-text stage — \`ft_decision\`

Filled with \`pending\` automatically (by \`check\` / \`report\`) for every record marked include or unsure.

| Value | Meaning |
|---|---|
| \`include\` | included source |
| \`exclude\` | set \`ft_reason\` to one of \`ft_reasons\` — one reason per record |

\`pdf_status\`: \`found\` or \`not-retrieved\`. A missing PDF is an access problem, not an exclusion: leave \`ft_decision\` pending and the record is counted as "not retrieved".

Optional: \`screener\` (your initials), \`notes\` (free text). \`screened_on\` is filled automatically.

## Second reviewer

\`sample_ta\` / \`sample_ft\` are set by \`prisma_review.py sample\`; the second reviewer never sees this vault's decisions, only the blind CSV sheet. Do not edit the \`r2_*\` properties by hand: they are imported from the returned sheet.

## Commands

${commands}
`;

/** 08 - Screening guide.md with the default exclusion reasons. */
export const screeningGuide = (reviewLink, generator = APP_GENERATOR) =>
  frontmatter.serialize({ type: "screening-guide", review: reviewLink, ta_reasons: [...DEFAULT_TA_REASONS], ft_reasons: [...DEFAULT_FT_REASONS] })
  + guideBody(generator.commands);

/**
 * 08 - Screening.base: the Obsidian Bases table over the records.
 * @param {string} recordsPath path of the records folder from the root of the Obsidian vault
 */
export function screeningBase(recordsPath) {
  const view = (name, extra, order) => {
    const filters = [`file.inFolder("${recordsPath}")`, 'type == "review-record"', ...extra].map(x => `        - ${x}`).join("\n");
    const columns = order.map(x => `      - ${x}`).join("\n");
    return `  - type: table
    name: ${name}
    filters:
      and:
${filters}
    order:
${columns}
    sort:
      - property: file.name
        direction: ASC
    columnSize:
      file.name: 420
`;
  };
  const ta = ["file.name", "year", "journal", "ta_decision", "ta_reason", "notes", "sources"];
  const ft = ["file.name", "year", "publication", "pdf_status", "ft_decision", "ft_reason", "notes"];
  return "views:\n" + [
    view("1 · Title-abstract to screen", ['ta_decision == "pending"'], ta),
    view("2 · Full text to screen", ['ft_decision == "pending"'], ft),
    view("Unsure at title-abstract", ['ta_decision == "unsure"'], [...ta, "ft_decision"]),
    view("Included", ['ft_decision == "include"'], ["file.name", "year", "journal", "publication", "sources"]),
    view("Excluded", ['ta_decision == "exclude" || ft_decision == "exclude"'], ["file.name", "year", "ta_decision", "ta_reason", "ft_decision", "ft_reason"]),
    view("Second-reviewer sample", ["sample_ta == true || sample_ft == true"], ["file.name", "ta_decision", "r2_ta_decision", "ft_decision", "r2_ft_decision"]),
    view("All records", [], ["file.name", "year", "journal", "doi", "sources", "publication", "ta_decision", "ft_decision", "screened_on"]),
  ].join("");
}

/** Header of 00 - Review log.md. */
export const logHeader = (reviewName, reviewLink, generator = APP_GENERATOR) =>
  frontmatter.serialize({ type: "review-log", review: reviewLink }) +
  `# ${reviewName} — log\n\nWritten by ${generator.logBy}; one row per command that changed something.\n\n| Date | Command | Details |\n|---|---|---|\n`;

/** One row of the review log. */
export const logRow = (today, command, details) => `| ${today} | ${command} | ${String(details).replaceAll("|", "/")} |\n`;

const stem = file => file.split("/").pop().replace(/\.md$/, "");

/**
 * 14 - PRISMA flow.md
 * @param {object} p
 * @param {string} p.reviewName @param {string} p.reviewLink @param {string} p.today
 * @param {ReturnType<typeof import("./flow.js").flowCounts>} p.counts
 * @param {import("./flow.js").SearchRow[]} p.searches
 * @param {{label: string, sampled: number, pairs: [string,string][], disagreements: object[], observed: number|null, kappa: number|null}[]} p.agreement
 * @param {string[]} p.testSet test-set publication names, sorted
 * @param {string[]} p.missed test-set papers the searches did not find
 * @param {{record: import("./records.js").ReviewRecord, text: string}[]} p.problems
 * @param {Generator} [p.generator]
 */
export function prismaFlowNote({ reviewName, reviewLink, today, counts: c, searches, agreement, testSet, missed, problems, generator = APP_GENERATOR }) {
  const br = rows => rows.map(s => `<br/>${s.database} (n = ${s.records})`).join("");
  const mermaid = `\`\`\`mermaid
flowchart TD
    A["Records identified from databases (n = ${c.identifiedDb})${br(c.db)}"] --> C
    B["Records from other sources (n = ${c.identifiedOther})${br(c.other)}"] --> C
    C["Duplicates removed (n = ${c.duplicates})"] --> S
    S["Records screened, title/abstract (n = ${c.unique})<br/>awaiting decision: ${c.taPending}"] --> SX["Records excluded (n = ${c.taExcluded})"]
    S --> R["Reports sought for retrieval (n = ${c.sought})"]
    R --> RN["Reports not retrieved (n = ${c.notRetrieved})"]
    R --> E["Reports assessed for eligibility (n = ${c.assessed})<br/>awaiting decision: ${c.ftPending}"]
    E --> EX["Reports excluded (n = ${c.ftExcluded})${c.ftReasons.map(([k, v]) => `<br/>${k}: ${v}`).join("")}"]
    E --> I["Sources included (n = ${c.included})"]
\`\`\``;
  const agreeRows = agreement.map(a => `| ${a.label} | ${a.sampled} | ${a.pairs.length} | ` +
    `${a.observed === null ? "" : formatPercent(a.observed)} | ${a.kappa === null ? "" : formatFixed(a.kappa, 2)} |`);
  const disagreements = agreement.flatMap(a => a.disagreements.map(d =>
    `- ${a.label}: [[${stem(d.record.file)}|${d.record.id}]] — you: ${d.mine}, second reviewer: ${d.theirs} (${d.reason || "no reason"})`));
  const lines = [
    frontmatter.serialize({ type: "prisma-flow", review: reviewLink, "generated-by": generator.path, generated: today }),
    `# ${reviewName} — PRISMA flow\n`,
    `> [!info] Generated — rerunning ${generator.rerun} overwrites this note.`,
    "> Screening happens in [[08 - Screening.base]]; allowed values are in [[08 - Screening guide]].\n",
    "## Flow diagram (PRISMA-ScR item 14)\n", mermaid, "",
    "## Counts\n", "| Stage | Count |", "|---|---:|",
    `| Records identified — databases | ${c.identifiedDb} |`, `| Records identified — other sources | ${c.identifiedOther} |`,
    `| Duplicates removed | ${c.duplicates} |`, `| Records screened (title/abstract) | ${c.unique} |`,
    `| — awaiting decision | ${c.taPending} |`, `| Records excluded | ${c.taExcluded} |`,
    `| Reports sought (include + unsure) | ${c.sought} |`, `| Reports not retrieved | ${c.notRetrieved} |`,
    `| Reports assessed (full text) | ${c.assessed} |`, `| — awaiting decision | ${c.ftPending} |`,
    `| Reports excluded | ${c.ftExcluded} |`, `| Sources included | ${c.included} |`, "",
    "## Exclusion reasons\n", "| Stage | Reason | Count |", "|---|---|---:|",
    ...c.taReasons.map(([k, v]) => `| Title/abstract | ${k} | ${v} |`),
    ...c.ftReasons.map(([k, v]) => `| Full text | ${k} | ${v} |`),
    "", "## Searches and other sources (PRISMA-ScR items 7–8)\n",
    "| ID | Kind | Database / source | Date | Query | Filters | Records | New | Duplicates |",
    "|---|---|---|---|---|---|---:|---:|---:|",
    ...searches.map(s => `| ${s.id} | ${s.kind} | ${s.database} | ${s.date} | \`${String(s.query).replaceAll("|", "/")}\` | ${s.filters} | ${s.records} | ${s.new} | ${s.duplicates} |`),
    "", "## Agreement with the second reviewer\n",
    "Cohen's κ is computed only from sampled records that both reviewers decided. Target κ ≥ 0.6.\n",
    "| Stage | Sampled | Both decided | % agreement | Cohen's κ |", "|---|---:|---:|---:|---:|", ...agreeRows, "",
    "### Disagreements to resolve\n", ...(disagreements.length ? disagreements : ["- none"]), "",
    "## Search validation (test set)\n",
    `Test set = publications with \`test_in: ${reviewLink}\` (or, if none, \`candidate_in\`). ` +
    `Retrieved by the searches: **${testSet.length - missed.length} of ${testSet.length}**.\n`,
  ];
  if (searches.length && missed.length) lines.push("<details><summary>Missed test-set papers</summary>\n", ...missed.map(m => `- ${m}`), "\n</details>");
  lines.push("", "## Open problems\n");
  lines.push(...(problems.length ? problems.map(p => `- [[${stem(p.record.file)}|${p.record.id}]]: ${p.text}`) : ["- none"]));
  return lines.join("\n") + "\n";
}
