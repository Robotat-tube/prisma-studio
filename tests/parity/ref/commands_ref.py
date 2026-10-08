"""Runs a fixed sequence of review commands with the Python engine on a copy of a review.

  python commands_ref.py PYTHON_TOOL_DIR REVIEW_DIR WORK_DIR

WORK_DIR/py/<review> gets the commands; WORK_DIR/js/<review> is an untouched copy for the JavaScript
engine; WORK_DIR/inputs holds the export and sheet both engines import. Prints the plan as JSON.
The original review folder is only read.
"""
import argparse
import contextlib
import csv
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, sys.argv[1])
import prisma_review as pr  # noqa: E402

TODAY = "2026-01-15"
pr.TODAY = TODAY
review, work = Path(sys.argv[2]), Path(sys.argv[3])
skip = shutil.ignore_patterns("10 - Full texts", "11 - Full texts", "*.pdf", "review_state.json")
for side in ("py", "js"):
    target = work / side / review.name
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(review, target, ignore=skip)
inputs = work / "inputs"
inputs.mkdir(parents=True, exist_ok=True)

rv = pr.Review(str((work / "py" / review.name).resolve()))
first = [r["fm"] for r in list(rv.records.values())[:3]]
ris = []
for fm in first:                                      # three duplicates of existing records
    ris += ["TY  - JOUR", f"TI  - {fm['title']}", f"PY  - {fm.get('year', '')}", f"DO  - {fm.get('doi', '')}",
            "AB  - An abstract supplied by the second export.", "ER  - "]
ris += ["TY  - JOUR", "TI  - Module identification for printed circuit board assemblies: a parity test",
        "AU  - Tester, A.", "AU  - Checker, B.", "PY  - 2025", "T2  - Journal of Tests", "DO  - 10.9999/parity.1",
        "KW  - modularity", "KW  - PCB", "ER  - ",
        "TY  - CONF", "TI  - A second new paper without abstract or DOI", "AU  - Solo, C.", "PY  - 2024", "ER  - ",
        "TY  - JOUR", "AU  - Nobody, N.", "PY  - 2020", "ER  - "]
(inputs / "parity export.ris").write_text("\n".join(ris) + "\n", encoding="utf-8")

ns = argparse.Namespace
log = []
def run(name, fn, **kw):
    with contextlib.redirect_stdout(sys.stderr):      # stdout carries only the JSON plan
        fn(pr.Review(str(rv.dir)), ns(**kw))
    log.append(name)

run("report", pr.cmd_report)
run("sample ta", pr.cmd_sample, stage="ta", fraction=0.05, seed=4242, redo=True)
sheet = rv.dir / "09 - Second reviewer" / f"ta-sample {TODAY} seed 4242.csv"
with sheet.open(encoding="utf-8-sig", newline="") as fh:
    rows = list(csv.DictReader(fh))
for i, row in enumerate(rows):                         # deterministic second-reviewer decisions
    row["decision"] = ["include", "exclude", "unsure", "exclude"][i % 4]
    row["reason"] = "E1" if row["decision"] == "exclude" else ""
rows.append({"record_id": "R9999", "decision": "include"})
rows.append({"record_id": rows[0]["record_id"], "decision": "maybe"})
filled = inputs / "filled sheet.csv"
with filled.open("w", encoding="utf-8-sig", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)
run("import-r2", pr.cmd_import_r2, file=str(filled), stage="ta")
run("import", pr.cmd_import, file=str(inputs / "parity export.ris"), database="Parity DB",
    query='TITLE-ABS-KEY("module identification" | PCB)', date="2026-01-14", filters="English", other=False)
run("add", pr.cmd_add, title="A snowballed paper on modular electronics", authors="Back, W.", year="2019",
    journal="", doi="", via="backward from R0001, iteration 1", database="Snowballing")
run("sample ft", pr.cmd_sample, stage="ft", fraction=0.1, seed=99, redo=True)

sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps({"today": TODAY, "review": review.name, "recordsPath": rv.rel(rv.rec_dir), "ran": log,
                  "template": str(pr.VAULT / "99 - Templates" / "Review Record Template.md"),
                  "library": str(pr.VAULT / "98 - Publications")}))
