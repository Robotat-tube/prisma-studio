"""Runs the stage actions of review_stages.py on copies of a review and its library, with a fixed clock and
fake OpenAlex answers (recorded on a tape that the JavaScript test replays).

  python stages_ref.py PYTHON_TOOL_DIR REVIEW_DIR WORK_DIR

WORK_DIR/stages/{py,js}/<review> and WORK_DIR/stages/{py,js}-vault/{98 - Publications, 99 - Templates} are
fresh copies; only the py side is changed here. Prints the results of the read-only checks and the tape as JSON.
"""
import json
import shutil
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, sys.argv[1])
import prisma_review as pr  # noqa: E402
import review_stages as rs  # noqa: E402

review, work = Path(sys.argv[2]), Path(sys.argv[3]) / "stages"
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
(inputs / "paper.pdf").write_bytes(b"%PDF-1.4\n% parity test full text\n%%EOF\n")

# fixed clock, no developer mode, temp library
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

# fake OpenAlex: deterministic answers, every request recorded
tape = {}
def code(s):
    return sum(map(ord, s)) % 997
def work_json(wid, title):
    return {"id": f"https://openalex.org/{wid}", "doi": f"https://doi.org/10.5555/{wid.lower()}", "title": title,
            "publication_year": 2000 + code(wid) % 25,
            "authorships": [{"author": {"display_name": f"Author {wid}"}}, {"author": None}],
            "primary_location": {"source": {"display_name": "Journal of Snowballs"}},
            "abstract_inverted_index": {"snowball": [1], "A": [0], "paper": [2]}, "referenced_works": []}
def fake_get(path, **params):
    flt = params.get("filter", "")
    if path.startswith("works/doi:"):
        doi = path[len("works/doi:"):]
        if code(doi) % 7 == 0:
            raise OSError("not found")
        res = {"id": f"https://openalex.org/W{code(doi)}", "referenced_works": [f"https://openalex.org/W9{code(doi) % 50}{k}" for k in range(4)]}
    elif flt.startswith("openalex:"):
        res = {"results": [work_json(i, f"Referenced paper {i} on modular products") for i in flt[9:].split("|") if code(i) % 3]}
    elif flt.startswith("cites:"):
        wid = flt[6:]
        res = {"results": [work_json(f"W8{code(wid) % 40}{k}", f"Citing paper {k} of {wid}") for k in range(2)],
               "meta": {"next_cursor": None}}
    elif "open_access" in params.get("select", ""):
        dois = flt[4:].split("|")
        res = {"results": [{"doi": f"https://doi.org/{d}", "open_access": {"oa_url": f"https://oa.example/{d}" if code(d) % 2 else None}} for d in dois]}
    elif flt.startswith("title_and_abstract.search:") and ",doi:" in flt:
        dois = flt.split(",doi:")[1].split("|")
        res = {"results": [{"doi": f"https://doi.org/{d}"} for d in dois if code(d) % 2 == 0]}
    elif flt.startswith("title_and_abstract.search:"):
        res = {"meta": {"count": 1000 + code(flt)}, "results": []}
    else:
        raise AssertionError(f"unexpected request {path} {params}")
    tape[json.dumps([path, sorted((k, str(v)) for k, v in params.items())], ensure_ascii=False, separators=(",", ":"))] = res
    return res
rs.oa_get = fake_get

rv = pr.Review(str((work / "py" / review.name).resolve()))
st = rs.load(rv)
out = {"review": review.name, "recordsPath": rv.rel(rv.rec_dir), "now": NOW, "today": TODAY}

rs.add_idea(st, "  A parity-test idea  ")
rs.save_questions(st, "P", "C", "Ctx", "Main question?", ["sub one", " ", "sub two"], "testing", amendment="parity amendment")
rs.set_ai_mode(st, "screening", "suggest", reason="parity: AI suggests")
rs.set_status(st, "idea", "done")
rs.save(rv, st)
rs.write_protocol(rv, st)
rs.save(rv, st)
out["lock_checks"] = rs.lock_checks(rv, st)
out["integrity"] = rs.integrity_problems(rv, st)
rs.pilot_manual(st, "Scopus", "TITLE-ABS-KEY(x)", "1234", note="by hand", retrieved="3", available="4")
rs.pilot_openalex(rv, st, note="fake OpenAlex")
export = next((rv.dir / "07 - Exports").glob("S01 - *"))
rs.pilot_file(rv, st, export, "Scopus", "the S01 string", note="from export")
rs.save(rv, st)
out["open_access"] = rs.find_open_access(rv, st, log=lambda *_: None)
queue = rs.retrieval_queue(rv)
out["queue"] = len(queue)
if queue:
    rs.mark_pdf(rv, st, queue[0]["fm"]["record_id"], "not-retrieved")
included = rs.included(rv)
rs.attach_pdf(rv, st, included[0]["fm"]["record_id"], inputs / "paper.pdf")
out["attached"] = included[0]["fm"]["record_id"]
rs.save(rv, st)
rs.prepare_charting(rv, st, appraisal=True)
rs.export_charting(rv, st)
rs.export_bibtex(rv, st)
rs.set_checklist(st, 4, "  Introduction  ", True)
rs.write_checklist(rv, st)
out["checklist_auto"] = rs.checklist_auto(rv, st)
rs.save(rv, st)
rs.snowball_round(rv, st, per_seed=3, log=lambda *_: None)
out["round_yield"] = rs.round_yield(rv, st)
rs.save(rv, st)
out["kept"] = rs.add_kept_to_library(rv, st)
rs.save(rv, st)
st["protocol"]["locked"] = ""
rs.lock_protocol(rv, st, registration="  OSF-PARITY  ")
rs.save(rv, st)
out["tape"] = tape
sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps(out, ensure_ascii=False))
