---
name: review-fetch-fulltexts
description: Find and attach the full-text PDFs for records awaiting full-text screening in a scoping review (PRISMA Studio) (Review Studio, stage 10). Use when the user asks to collect, download, or fetch the PDFs or full texts for a review.
---

# Fetch full texts

Your job is to get the full text of every record in the retrieval queue and attach it with `ai-assist.js attach`. That command copies the PDF into `10 - Full texts/` under the record's name and logs it. You never decide anything about a paper, and you never mark one as "not retrieved": that is the reviewer's call, after their own library attempt.

## Steps

1. **Get the queue:**
   ```
   node "C:/Users/A-Bag/Desktop/prisma-studio/bin/ai-assist.js" --review "<full path of the review records folder>" context retrieval --limit 200
   ```
   - If AI assistance is **off**, stop and tell the user where to switch it on (Review Studio, stage 10).
   - Each record comes with title, authors, year, DOI, URL and `oa_url`, which is filled when Review Studio found an open-access link.

   - Before downloading anything, ask whether the user has already run "Find PDFs in a folder…" on the Retrieval page, which matches PDFs already on their PC (Downloads, Zotero, a library folder) by DOI or by title plus first author. Records it found are no longer in the queue.

2. **Look for each PDF, in this order:**
   1. `oa_url`, if present.
   2. The Unpaywall API: `https://api.unpaywall.org/v2/<doi>?email=<the user's email>`, and its `best_oa_location.url_for_pdf`.
   3. Repositories: arXiv, author pages, institutional repositories. Use a search engine with the exact title.
   4. Publisher access through the user's own browser, if they have institutional access and have said you may use it. Check the user's memory or notes for publisher-specific recipes. Common PDF URL patterns:
      - Springer: `/content/pdf/<doi>.pdf`
      - Taylor & Francis: `/doi/pdf/<doi>?download=true`
      - IEEE: `/stampPDF/getPDF.jsp?tp=&arnumber=<n>`
      - ScienceDirect: the article's "View PDF" link

   Save each download to a temporary folder outside the review folder.

3. **Check before attaching.** The file must start with `%PDF-`, and its first page must show the record's title. Publishers sometimes serve a related article, a cover page or a login page. A preprint is fine; mention it in your report.

4. **Attach each PDF:**
   ```
   node "C:/Users/A-Bag/Desktop/prisma-studio/bin/ai-assist.js" --review "<full path of the review records folder>" attach R0123 "C:/temp/x.pdf" --model "<your exact model id>"
   ```

5. **Never bypass access controls:** no CAPTCHA solving, no shadow libraries (Sci-Hub, LibGen and the like), no sharing logins. If a site asks "are you a robot", leave that paper for the user.

6. **Report:** how many attached (and how many of those are preprints), plus the list you couldn't get, with what you tried. The user can then try interlibrary loan or mark those papers as not retrieved in Review Studio.
