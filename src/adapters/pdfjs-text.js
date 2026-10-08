/**
 * PdfText adapter over Mozilla pdf.js. Pass the pdf.js module (browsers: "pdfjs-dist/build/pdf.mjs" with a
 * worker; Node: "pdfjs-dist/legacy/build/pdf.mjs").
 * @module adapters/pdfjs-text
 */

/** @returns {import("../ports/pdf-text.js").PdfText} */
export function pdfjsText(pdfjs) {
  return {
    async firstPages(bytes, pages = 2) {
      const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, verbosity: 0 });
      const doc = await task.promise;
      try {
        const { info } = await doc.getMetadata().catch(() => ({ info: {} }));
        const props = [info?.Title, info?.Subject, info?.Custom?.doi, info?.Keywords].map(v => v ?? "").join(" ");
        const texts = [];
        for (let n = 1; n <= Math.min(pages, doc.numPages); n++) {
          const content = await (await doc.getPage(n)).getTextContent();
          texts.push(content.items.map(item => (item.str ?? "") + (item.hasEOL ? "\n" : "")).join(""));
        }
        return props + " " + texts.join(" ");
      } finally {
        await task.destroy();
      }
    },
  };
}
