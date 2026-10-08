"""Runs `prisma_review.py sync --apply` on copies of a review and its library.

  python sync_ref.py PYTHON_TOOL_DIR REVIEW_DIR WORK_DIR

Copies the review's records to WORK_DIR/sync/review and the library (98 - Publications notes, no PDFs) to
WORK_DIR/sync/py-vault/98 - Publications and WORK_DIR/sync/js-vault/98 - Publications, then syncs the
py copy. Prints the printed messages as JSON. Neither the review nor the real library is written.
"""
import argparse
import contextlib
import io
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, sys.argv[1])
import prisma_review as pr  # noqa: E402

review, work = Path(sys.argv[2]), Path(sys.argv[3]) / "sync"
library = pr.VAULT / "98 - Publications"
if work.exists():
    shutil.rmtree(work)
shutil.copytree(review / "08 - Records", work / "review" / review.name / "08 - Records")
for side in ("py-vault", "js-vault"):
    (work / side / "98 - Publications").mkdir(parents=True)
    for f in library.glob("*.md"):
        shutil.copy2(f, work / side / "98 - Publications" / f.name)

pr.TODAY = "2026-01-15"
pr.VAULT = work / "py-vault"
out = io.StringIO()
with contextlib.redirect_stdout(out):
    pr.cmd_sync(pr.Review(str(work / "review" / review.name)), argparse.Namespace(apply=True))
sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps({"review": review.name, "printed": out.getvalue()}, ensure_ascii=False))
