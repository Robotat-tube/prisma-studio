/**
 * Port: reading the text of a PDF (its properties and first pages). Implementation: adapters/pdfjs-text.js
 * (Mozilla pdf.js, in browsers and Node).
 * @module ports/pdf-text
 */

/**
 * @typedef {object} PdfText
 * @property {(bytes: Uint8Array, pages?: number) => Promise<string>} firstPages
 *   the PDF's title, subject, DOI and keywords properties and the text of its first `pages` pages (default 2);
 *   rejects for damaged, encrypted or unreadable files
 */

export {};
