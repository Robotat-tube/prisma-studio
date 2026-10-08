"""Matches of the Python PDF finder (pypdf) for the review's records without a full text, in a PDF folder.

  python local_pdfs_ref.py PYTHON_TOOL_DIR REVIEW_DIR PDF_DIR      (only reads)
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, sys.argv[1])
import prisma_review as pr  # noqa: E402
import local_pdfs  # noqa: E402

rv = pr.Review(str(Path(sys.argv[2]).resolve()))
full = rv.dir / "10 - Full texts"
need = {rid: r["fm"] for rid, r in rv.records.items()
        if r["fm"].get("ta_decision") in ("include", "unsure") and not (full / f"{r['path'].stem}.pdf").exists()}
res = local_pdfs.scan(sys.argv[3], need, log=lambda *_: None)
for m in res["matches"]:
    m["pdf"] = Path(m["pdf"]).relative_to(sys.argv[3]).as_posix()
sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps({"pdfs": res["pdfs"], "records": res["records"], "matches": res["matches"]}, ensure_ascii=False))
