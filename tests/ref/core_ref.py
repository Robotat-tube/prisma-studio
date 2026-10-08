"""Reference output of the Python engine (prisma_review.py) for tests/core.test.js.

  python core_ref.py PYTHON_TOOL_DIR REVIEW_DIR  ->  JSON on stdout
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, sys.argv[1])
import prisma_review as pr  # noqa: E402

review = Path(sys.argv[2])
out = {"records": [], "index": {}, "ratios": [], "exports": {}}
idx = pr.Index()
files = sorted((review / "08 - Records").glob("R*.md"))
for f in files:
    text = f.read_text(encoding="utf-8")
    fm, body = pr.read_fm(text)
    out["records"].append({
        "file": f.name, "fm": fm, "body_len": len(body), "dump": pr.dump_fm(fm),
        "name": pr.record_name(fm.get("record_id", ""), fm.get("authors"), fm.get("year"), fm.get("title")),
        "cited": pr.cited_authors(fm.get("authors")), "norm_title": pr.norm_title(fm.get("title")),
        "norm_doi": pr.norm_doi(fm.get("doi")), "year": pr.year_of(fm.get("year")),
        "set_list": pr.set_list_key(text, "sources", ["A", "B, c"])[:2000],
    })
    idx.add(fm.get("record_id"), fm.get("doi"), fm.get("title"), pr.year_of(fm.get("year")))
for r in out["records"]:
    fm = r["fm"]
    # look each record up with a slightly changed title and no DOI, so the fuzzy path is exercised too
    out["index"][r["file"]] = idx.find("", str(fm.get("title", "")) + " x", pr.year_of(fm.get("year")))
titles = [r["norm_title"] for r in out["records"] if len(r["norm_title"]) > 25][:400]
out["ratios"] = [[a, b, pr.SequenceMatcher(None, a, b).ratio()] for a, b in zip(titles, titles[1:] + titles[:1])]
for f in sorted((review / "07 - Exports").glob("*")):
    if f.suffix.lower() in (".ris", ".bib", ".csv", ".txt", ".tsv", ".nbib"):
        out["exports"][f.name] = pr.parse_file(f)
sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps(out, ensure_ascii=False))
