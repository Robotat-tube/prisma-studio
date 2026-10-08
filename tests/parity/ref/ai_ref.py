"""Runs the AI-assist commands (ai_assist.py) on a copy of a review with every AI mode switched on.

  python ai_ref.py PYTHON_TOOL_DIR REVIEW_DIR WORK_DIR

WORK_DIR/ai/{py,js}/<review> are identical prepared copies (AI modes on, a few records reset, a blind sheet);
only the py side runs the commands here. Prints each command's output and the inputs used, as JSON.
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
import review_stages as rs  # noqa: E402
import ai_assist  # noqa: E402

review, work = Path(sys.argv[2]), Path(sys.argv[3]) / "ai"
if work.exists():
    shutil.rmtree(work)
NOW, TODAY = "2026-01-15 10:00", "2026-01-15"
rs.now = lambda: NOW
pr.TODAY = TODAY
rs.dev_mode = lambda: False
skip = shutil.ignore_patterns("10 - Full texts", "11 - Full texts", "*.pdf")
inputs = work / "inputs"
inputs.mkdir(parents=True)
(inputs / "paper.pdf").write_bytes(b"%PDF-1.4\n% fetched by the parity test\n%%EOF\n")

def prepare(side):
    """The same starting point on both sides: AI modes on, records to work on, one blind sheet."""
    target = work / side / review.name
    shutil.copytree(review, target, ignore=skip)
    rv = pr.Review(str(target))
    st = rs.load(rv)
    st["ai"] = {"screening": "suggest-ft", "reviewer": "ai", "retrieval": "assist", "charting": "prefill"}
    recs = sorted(rv.records.values(), key=lambda r: r["fm"]["record_id"])
    for r in [r for r in recs if r["fm"].get("ta_decision") == "exclude"][:3]:
        f = r["fm"]
        f["ta_decision"], f["ta_reason"] = "pending", ""
        for k in ("ai_decision", "ai_reason", "ai_why"):
            f.pop(k, None)
        r["dirty"] = True
    for r in [r for r in recs if r["fm"].get("ft_decision") == "include"][:2]:
        f = r["fm"]
        f["ft_decision"], f["pdf_status"] = "pending", ""
        for k in ("ai_ft_decision", "ai_ft_reason", "ai_ft_why", "pdf"):
            f.pop(k, None)
        r["dirty"] = True
    for r in [r for r in recs if r["fm"].get("ft_decision") == "include"][2:5]:
        r["fm"]["chart_checked_by"] = "AI"
        for f in st["charting"]["fields"]:
            if f["name"] not in ("checked_by",):
                r["fm"][f"chart_{f['name']}"] = ""
        r["dirty"] = True
    rv.save()
    rs.save(rv, st)
    with contextlib.redirect_stdout(io.StringIO()):
        pr.cmd_sample(pr.Review(str(target)), argparse.Namespace(stage="ta", fraction=0.002, seed=5, redo=True))
    return target

for side in ("py", "js"):
    prepare(side)
pr.VAULT = work / "py"
target = work / "py" / review.name

def run(fn, *args):
    rv = pr.Review(str(target))
    st = rs.load(rv)
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out):
            fn(rv, st, *args)
    except SystemExit as e:
        out.write(f"EXIT {e.code}")
    return out.getvalue()

rv = pr.Review(str(target))
recs = sorted(rv.records.values(), key=lambda r: r["fm"]["record_id"])
pending = [r["fm"]["record_id"] for r in recs if r["fm"].get("ta_decision") == "pending"]
ftq = [r["fm"]["record_id"] for r in recs if r["fm"].get("ft_decision") == "pending" and r["fm"].get("ta_decision") in ("include", "unsure")]
decided = [r["fm"]["record_id"] for r in recs if r["fm"].get("ta_decision") == "include"][0]
field = next(f["name"] for f in rs.load(rv)["charting"]["fields"] if f["name"] != "checked_by")
charting = [r["fm"]["record_id"] for r in recs if r["fm"].get("ft_decision") == "include"
            and r["fm"].get("chart_checked_by") == "AI" and not str(r["fm"].get(f"chart_{field}", "")).strip()][:2]

inputs_json = {
    "suggest_ta": [{"id": pending[0], "decision": "include", "why": " clear fit "}, {"id": pending[1], "decision": "exclude", "reason": "E1 not about", "why": "off topic"},
                   {"id": pending[2], "decision": "exclude", "reason": "E99"}, {"id": "R9999", "decision": "include"}, {"id": decided, "decision": "exclude", "reason": "E1"}],
    "suggest_ft": [{"id": ftq[0], "decision": "include", "why": "p. 3"}, {"id": ftq[1], "decision": "include"}],
    "chart": [{"id": charting[0], "fields": {field: " a value ", "checked_by": "reviewer", "unknown": "x"}}, {"id": charting[1], "fields": {}}, {"id": pending[0], "fields": {field: "x"}}],
}
for k, v in inputs_json.items():
    (inputs / f"{k}.json").write_text(json.dumps(v), encoding="utf-8")

outputs = {}
outputs["context screening"] = run(ai_assist.context, "screening", 2)
outputs["suggest ta"] = run(ai_assist.suggest, str(inputs / "suggest_ta.json"), "parity-model", "ta")
outputs["context retrieval"] = run(ai_assist.context, "retrieval", 3)
outputs["attach"] = run(ai_assist.attach, ftq[0], str(inputs / "paper.pdf"), "parity-model")
outputs["context fulltext"] = run(ai_assist.context, "fulltext", 2)
outputs["suggest ft"] = run(ai_assist.suggest, str(inputs / "suggest_ft.json"), "parity-model", "ft")
outputs["context reviewer"] = run(ai_assist.context, "reviewer", 40)
sheet = json.loads(outputs["context reviewer"])
r2 = [{"record_id": x["record_id"], "decision": ["include", "exclude", "unsure"][i % 3], "reason": "E1 x" if i % 3 == 1 else ""} for i, x in enumerate(sheet["records"])]
(inputs / "r2.json").write_text(json.dumps(r2), encoding="utf-8")
outputs["r2"] = run(ai_assist.r2, str(inputs / "r2.json"), "parity-model")
outputs["context charting"] = run(ai_assist.context, "charting", 2)
outputs["chart"] = run(ai_assist.chart, str(inputs / "chart.json"), "parity-model")
sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps({"review": review.name, "now": NOW, "today": TODAY, "attach": ftq[0], "outputs": outputs}, ensure_ascii=False))
