---
name: review-screen-abstracts
description: Suggest title/abstract screening decisions for a scoping review (PRISMA Studio) (Review Studio, stage 8). Use when the user asks to pre-screen, suggest decisions, or help with title/abstract screening of a review. The reviewer confirms every suggestion; this skill never decides.
---

# Suggest title/abstract decisions

You suggest; the reviewer decides. You write only `ai_decision`, `ai_reason` and `ai_why` on records that are still `pending`. The reviewer then confirms or changes each suggestion in Review Studio (Screening → **Suggested** queue), and only that writes `ta_decision`.

All reading and writing goes through `bin/ai-assist.js` (PRISMA Studio). Pass `--review` the review's name (e.g. `Project 2 review`) or the full path of its `<name> records` folder. When a name fits more than one folder (a review and its test copy) the command lists them: ask the reviewer which one, never pick yourself. Never edit record notes, `review_state.json` or the screening guide yourself.

## Steps

1. **Get the batch.** Run this from any folder:
   ```
   node "C:/Users/A-Bag/Desktop/prisma-studio/bin/ai-assist.js" --review "<review name or full path of its records folder>" context screening --limit 40
   ```
   - If it says AI assistance is **off**, stop. Tell the user to switch it on in Review Studio: stage 8, the AI assistance card. Never switch it on yourself.
   - The output has the review questions (PCC), the eligibility text, the exclusion reasons (`ta_reasons`, e.g. `E1 …`), `remaining`, and up to 40 records with title and abstract.

2. **Judge each record against the eligibility criteria and the questions only.** Rules:
   - **Be cautious.** In doubt → `unsure` (it goes to full text). Exclude only when the title and abstract clearly meet an exclusion reason.
   - **No abstract** → `unsure`, unless the title alone clearly meets an exclusion reason.
   - Every `exclude` takes exactly one reason code from `ta_reasons`: the first one that applies, in list order.
   - `why`: one short sentence pointing to what in the title or abstract decided it. Never invent content that isn't in the record.

3. **Write the suggestions** to a JSON file in your scratch or temp folder, never in the review folder:
   ```json
   [{"id": "R0123", "decision": "exclude", "reason": "E2", "why": "Software modularity only (microservices)."},
    {"id": "R0124", "decision": "unsure", "why": "Mentions DSM but unclear whether the product is electronic."}]
   ```
   Then run:
   ```
   node "C:/Users/A-Bag/Desktop/prisma-studio/bin/ai-assist.js" --review "<review name or full path of its records folder>" suggest FILE.json --model "<your exact model id>"
   ```
   Read the "skipped" lines and fix any invalid reason codes.

4. **Repeat** while `remaining` > 0 and the user wants more. Batches of 40 keep each judgement careful.

5. **Report:** how many records you suggested (include / unsure / exclude per reason), anything that made the criteria hard to apply, and a reminder to confirm the batches in Review Studio. Criteria problems belong to the reviewer; a change after the protocol lock is an amendment.
