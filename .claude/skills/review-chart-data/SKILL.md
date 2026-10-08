---
name: review-chart-data
description: Prefill the data-charting form from the full texts of included papers in a scoping review in this vault (Review Studio, stage 12). Use when the user asks to chart, extract data from, or fill the charting table for included papers.
---

# Prefill data charting

You fill empty charting fields for included papers, from the full text, with page locators. Each paper you touch stays `checked_by: AI` until the reviewer checks it in Review Studio ("Checked — next"). You never overwrite a value already there, and you never touch a paper the reviewer has checked. `ai_assist.py` enforces both rules.

## Steps

1. **Get the next papers:**
   ```
   python "95 - Tools/PRISMA review/ai_assist.py" --review "<review>" context charting --limit 5
   ```
   - If AI assistance is **off**, stop and tell the user where to switch it on (Review Studio, stage 12).
   - The output has the review questions, the charting `fields` (name + description, which often fixes the allowed values), and per paper its `pdf` path and the fields already `filled`.

2. **Read each PDF** (use the pdf skill or a PDF reader; read the whole paper, not only the abstract). For every empty field:
   - Follow the field description exactly. Where it lists allowed values ("One of: …"), use one of them, spelled the same.
   - Put page, section, table or figure numbers for every value in `locators`, e.g. `method_family p. 4 §3.2; evaluation Table 5`.
   - Set `basis` to `full text`. If there's no PDF (`pdf` is empty), chart from the abstract in the record note and set `basis` to `abstract`.
   - Not reported in the paper → write `not reported`. Never guess.

3. **Write the values** to a JSON file in your scratch or temp folder:
   ```json
   [{"id": "R0123", "fields": {"method_family": "DSM clustering", "evaluation": "case study", "locators": "p. 4 §3.2; Table 5", "basis": "full text"}}]
   ```
   Then run:
   ```
   python "95 - Tools/PRISMA review/ai_assist.py" --review "<review>" chart FILE.json --model "<your exact model id>"
   ```

4. **Repeat** for further batches if the user wants. Then report how many papers you prefilled and any field whose description was hard to apply consistently. That is useful feedback for the charting form, and changing the form after the lock is an amendment.
