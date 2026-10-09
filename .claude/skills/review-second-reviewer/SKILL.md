---
name: review-second-reviewer
description: Act as the independent (blind) second reviewer on the screening sample of a scoping review (PRISMA Studio) (Review Studio, stage 9), when the review chose "AI as second reviewer". Use when the user asks the AI to fill the second-reviewer sheet or compute agreement with an AI reviewer.
---

# Blind second reviewer

You screen the random sample independently. Blindness is the whole point of this step. You see only the blind sheet and the criteria, never the first reviewer's decisions. So do not open record notes, `Screening.base`, the PRISMA flow, or the timeline for this review while you work.

All reading and writing goes through `bin/ai-assist.js` (PRISMA Studio). Pass `--review` the review's name (e.g. `Project 2 review`) or the full path of its `<name> records` folder. When a name fits more than one folder (a review and its test copy) the command lists them: ask the reviewer which one, never pick yourself.

## Steps

Run the commands from the PRISMA Studio folder (the project open in Claude Code).

1. **Get the sheet:**
   ```
   node bin/ai-assist.js --review "<review name or full path of its records folder>" context reviewer
   ```
   - If it says AI assistance is **off**, stop: this review uses a human second reviewer.
   - If there's no sheet yet, the reviewer first draws the sample in Review Studio (stage 9).
   - The output has the questions, the eligibility text, the reasons, `stage` (`ta` = title/abstract, `ft` = full text) and the sampled records.

2. **Decide every record:** `include`, `exclude` or `unsure`.
   - At `ta`: in doubt → `unsure`. Each `exclude` takes the first applicable reason code from `ta_reasons`.
   - At `ft`: use `ft_reasons` and the full text in the review's `10 - Full texts/` folder (named like the record). Open only the PDF, nothing else. `unsure` is a last resort at this stage.
   - Judge each record on its own. Do not try to match an expected inclusion rate.

3. **Write all decisions** to a JSON file in your scratch or temp folder:
   ```json
   [{"record_id": "R0123", "decision": "exclude", "reason": "E1"}, {"record_id": "R0124", "decision": "include"}]
   ```
   Then run:
   ```
   node bin/ai-assist.js --review "<review name or full path of its records folder>" r2 FILE.json --model "<your exact model id>"
   ```
   This saves a filled copy of the sheet named `… (AI).csv`, imports it, recomputes Cohen's κ and logs the model and date.

4. **Report to the user:** the number decided and κ (from the output). Tell them to read every disagreement in Review Studio and settle each one. Remind them the report must name the second reviewer as an AI (model, date); the protocol does this automatically.
