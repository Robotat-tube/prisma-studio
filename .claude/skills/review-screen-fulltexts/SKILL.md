---
name: review-screen-fulltexts
description: Suggest full-text screening decisions for a scoping review (PRISMA Studio) (Review Studio, stage 8, Full text tab) by reading each retrieved PDF against the eligibility criteria. Use when the user asks to pre-screen, suggest decisions for, or help with full-text screening of a review. The reviewer confirms every suggestion; this skill never decides.
---

# Suggest full-text decisions

You suggest; the reviewer decides. For records that passed title/abstract screening and have a PDF attached, you read the full text and write only `ai_ft_decision`, `ai_ft_reason` and `ai_ft_why`. The reviewer then confirms or changes each suggestion in Review Studio (Screening → Full text tab → **Suggested** queue), and only that writes `ft_decision`.

All reading and writing goes through `bin/ai-assist.js` (PRISMA Studio). Pass `--review` the full path of the review's `<name> records` folder (ask the reviewer if you do not know it; the test copy is `C:/Users/A-Bag/Desktop/PRISMA Studio test/Project 2 review records`). Never edit record notes or `review_state.json` yourself.

## Steps

1. **Get the batch.** Run this from any folder:
   ```
   node "C:/Users/A-Bag/Desktop/prisma-studio/bin/ai-assist.js" --review "<full path of the review records folder>" context fulltext --limit 5
   ```
   - If it says full-text suggestions are **off**, stop. Tell the user that the reviewer can choose "AI suggests (+ full text)" in Review Studio (stage 8, AI assistance card).
   - The output has the review questions (PCC), the eligibility text, the full-text exclusion reasons (`ft_reasons`), `remaining`, `without_pdf` and up to 5 records with their `pdf` path.
   - Records without a PDF are not listed; retrieval comes first (skill `review-fetch-fulltexts`).

2. **Read each PDF completely** (use the pdf skill or a PDF reader): methods, case study and results, not only the abstract and conclusions. Then judge it against the eligibility criteria and the questions only:
   - **Full text is where the decision is made**, so `unsure` is a last resort. Use it only when the paper is genuinely ambiguous against a criterion, and say which criterion.
   - Every `exclude` takes exactly one reason code from `ft_reasons`: the first one that applies, in list order.
   - **First check that the PDF is the right paper** (title and authors on page 1). If it isn't, don't suggest anything for that record; report it so the PDF can be replaced.
   - `why`: one or two sentences with page or section locators, e.g. `Software product lines only (§2, p. 3); no physical product.` Never claim anything the paper does not say.

3. **Write the suggestions** to a JSON file in your scratch or temp folder, never in the review folder:
   ```json
   [{"id": "R0123", "decision": "include", "why": "DSM-based module identification for a PCB assembly, case study §4 p. 7."},
    {"id": "R0124", "decision": "exclude", "reason": "E3", "why": "Supply-chain modularity only (p. 2, §1)."}]
   ```
   Then run:
   ```
   node "C:/Users/A-Bag/Desktop/prisma-studio/bin/ai-assist.js" --review "<full path of the review records folder>" suggest FILE.json --stage ft --model "<your exact model id>"
   ```
   Read the "skipped" lines and fix any invalid reason codes.

4. **Repeat** while `remaining` minus `without_pdf` is greater than 0 and the user wants more. Small batches of about 5 papers keep every paper read in full.

5. **Report:**
   - counts per decision and reason;
   - wrong or incomplete PDFs;
   - records still waiting for a PDF;
   - any criterion that was hard to apply consistently. That is for the reviewer; a change after the protocol lock is an amendment.

   Remind the user to confirm the batches in the Full text tab.
