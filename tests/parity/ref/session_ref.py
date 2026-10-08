"""Runs Review Studio's actions (review_server.act) on copies of a review and its library with a fixed clock.

  python session_ref.py PYTHON_TOOL_DIR REVIEW_DIR WORK_DIR

WORK_DIR/session/{py,js}/<review> and {py,js}-vault are fresh copies; only the py side is changed here.
Prints the plan (the actions with their arguments) and Python's answers as JSON.
"""
import contextlib
import io
import json
import shutil
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, sys.argv[1])
import prisma_review as pr  # noqa: E402
import review_stages as rs  # noqa: E402
import review_server as srv  # noqa: E402

review, work = Path(sys.argv[2]), Path(sys.argv[3]) / "session"
vault = pr.VAULT
if work.exists():
    shutil.rmtree(work)
skip = shutil.ignore_patterns("10 - Full texts", "11 - Full texts", "*.pdf")
for side in ("py", "js"):
    shutil.copytree(review, work / side / review.name, ignore=skip)
    (work / f"{side}-vault" / "98 - Publications").mkdir(parents=True)
    for f in (vault / "98 - Publications").glob("*.md"):
        shutil.copy2(f, work / f"{side}-vault" / "98 - Publications" / f.name)
    shutil.copytree(vault / "99 - Templates", work / f"{side}-vault" / "99 - Templates")
inputs = work / "inputs"
inputs.mkdir()
(inputs / "parity export.ris").write_text("TY  - JOUR\nTI  - A session parity paper on modular power electronics\nAU  - Session, S.\nPY  - 2025\nER  - \n", encoding="utf-8")

NOW, TODAY = "2026-01-15 10:00", "2026-01-15"
class FixedDate(date):
    @classmethod
    def today(cls):
        return date(2026, 1, 15)
rs.now = lambda: NOW
rs.date = FixedDate
pr.TODAY = TODAY
rs.dev_mode = lambda: False
pr.VAULT = work / "py-vault"

name = str((work / "py" / review.name).resolve())
rv = pr.Review(name)
recs = sorted(rv.records.values(), key=lambda r: r["fm"]["record_id"])
with_ai = [r["fm"]["record_id"] for r in recs if r["fm"].get("ai_decision") and r["fm"].get("ta_decision") != "pending"][:3]
plain = [r["fm"]["record_id"] for r in recs if r["fm"].get("ta_decision") == "exclude" and not r["fm"].get("ai_decision")][:2]
included = [r["fm"]["record_id"] for r in recs if r["fm"].get("ft_decision") == "include"][:1]
st = rs.load(rv)
text = dict(st["protocol_text"], rationale=(st["protocol_text"].get("rationale") or "") + " Parity sentence.")
lib = sorted(p.stem for p in (pr.VAULT / "98 - Publications").glob("*.md"))[:3]
reasons_ta, reasons_ft = rv.reasons()

plan = [
    ["ai_mode", {"stage": "retrieval", "mode": "assist", "amendment": "parity: AI fetches PDFs"}],
    ["stage_status", {"stage": "appraisal", "status": "skipped", "reason": "not planned in the protocol"}],
    ["add_idea", {"text": "  Parity idea  "}],
    ["save_questions", {"q": {"population": "P2", "concept": "C2", "context": "X2", "main": "Main?", "sub": ["one", " "]}, "why": "sharper", "amendment": "supervisor asked"}],
    ["save_concepts", {"concepts": [{"name": " Modularity ", "role": "AND", "terms": ["modular*", " ", "module"]}, {"name": "", "terms": []},
                                    {"name": "Software", "role": "NOT", "terms": ["software"]}], "why": "tighter", "amendment": "pilot showed noise"}],
    ["save_databases", {"databases": ["Scopus", " ", "OpenAlex"], "amendment": "IEEE dropped"}],
    ["save_manual_query", {"db": "Scopus", "text": "TITLE-ABS-KEY(modular*)", "amendment": "hand edit"}],
    ["save_manual_query", {"db": "Scopus", "text": None, "amendment": "back to generated"}],
    ["pilot_manual", {"database": "Scopus", "hits": "10", "note": "by hand", "retrieved": "1", "available": "2"}],
    ["save_protocol_text", {"text": text, "author": "claude", "generate": True, "amendment": "rationale extended"}],
    ["approve_section", {"key": "rationale"}],
    ["supervisor_review", {"by": " Prof. Parity ", "when": ""}],
    ["save_reasons", {"ta": list(reasons_ta) + [" "], "ft": list(reasons_ft) + ["E9 parity reason"], "amendment": "new reason"}],
    ["set_test_set", {"stems": lib}],
    *[["decide", {"record_id": rid, "stage": "ta", "decision": "pending"}] for rid in with_ai + plain],
    ["apply_decisions", {"items": [{"id": rid, "decision": d, "reason": "E1" if d == "exclude" else ""} for rid, d in zip(with_ai, ["include", "exclude", "unsure"])], "stage": "ta"}],
    ["bulk_decide", {"ids": plain, "reason": "E2"}],
    ["clear_presort", {"ids": plain}],
    ["set_record", {"record_id": included[0], "fields": {"chart_study_type": "case study", "notes": "parity", "appraisal": "ok", "presort": "ignored"}}],
    ["save_fields", {"fields": [{"name": " Study Type ", "description": "design"}, {"name": "", "description": ""}, {"name": "locators", "description": "pages"}], "amendment": "form simplified"}],
    ["appraisal_tool", {"tool": "MMAT 2018"}],
    ["checklist", {"n": 5, "location": " Methods ", "done": True}],
    ["write_checklist", {}],
    ["export", {"kind": "bib"}],
    ["export", {"kind": "csv"}],
    ["sample", {"stage": "ft", "fraction": 0.1, "seed": "7", "redo": True}],
    ["add_paper", {"title": "A paper added in the session", "year": "2021", "authors": "Added, A.", "via": "colleague tip"}],
    ["check", {}],
    ["report", {}],
    ["prepare_charting", {"appraisal": True}],
    ["sync", {"apply": True}],
    ["add_to_library", {}],
    ["import", {"path": str(inputs / "parity export.ris"), "database": "Parity DB", "query": "q", "date": "2026-01-14", "filters": "", "other": False}],
]
answers = []
for action, args in plan:
    with contextlib.redirect_stdout(sys.stderr):
        res = srv.act(name, action, json.loads(json.dumps(args)))
    answers.append(res.get("message", ""))
sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps({"review": review.name, "recordsPath": rv.rel(rv.rec_dir), "now": NOW, "today": TODAY, "plan": plan, "answers": answers}, ensure_ascii=False))
