/**
 * Port: the review folder. Services read and write a review only through this interface, so the same
 * code runs on Node (tests, command line) and in the browser (File System Access API).
 *
 * Paths are relative to the review folder and always use "/" (e.g. "08 - Records/R0001 - ….md").
 * Text is UTF-8. Implementations: adapters/node-folder.js, adapters/memory-folder.js and, later,
 * adapters/browser-folder.js.
 *
 * @module ports/folder
 */

/**
 * @typedef {object} Folder
 * @property {string} name                                        display name of the folder
 * @property {(path: string) => Promise<boolean>} exists
 * @property {(path: string) => Promise<boolean>} isDirectory
 * @property {(path: string) => Promise<number>} lastModified   milliseconds since 1970
 * @property {(path: string) => Promise<string>} readText          rejects when the file is missing
 * @property {(path: string, text: string) => Promise<void>} writeText   creates parent folders
 * @property {(path: string, text: string) => Promise<void>} appendText  creates the file if missing
 * @property {(path: string) => Promise<Uint8Array>} readBytes
 * @property {(path: string, bytes: Uint8Array) => Promise<void>} writeBytes
 * @property {(dir: string) => Promise<string[]>} list             file names directly inside dir, sorted; [] if dir is missing
 * @property {(dir: string) => Promise<void>} makeDir              like mkdir -p
 */

/**
 * Port: the current date, injected so that services stay testable and reproducible.
 * @typedef {object} Clock
 * @property {() => string} today   ISO date, e.g. "2026-10-08"
 * @property {() => string} now     "2026-10-08 14:05"
 */

export {};
