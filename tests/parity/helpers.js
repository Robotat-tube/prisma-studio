// Shared helpers for parity tests: run a Python reference script once, compare many values at once.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

export const PY = process.env.PRISMA_PY;
export const REVIEW = process.env.REVIEW_DIR;
export const skipWithoutReview = !PY || !REVIEW ? "set PRISMA_PY and REVIEW_DIR to compare with the Python engine" : false;

const cache = new Map();

/** Output (JSON) of tests/parity/ref/<script> for PY and REVIEW, computed once per test run. */
export function pythonReference(script, ...args) {
  const key = [script, ...args].join("|");
  if (!cache.has(key)) {
    const r = spawnSync("python", [join(import.meta.dirname, "ref", script), PY, REVIEW, ...args],
      { encoding: "utf8", maxBuffer: 1 << 30, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    if (r.status !== 0) throw new Error(`${script} failed:\n${r.stderr}`);
    cache.set(key, JSON.parse(r.stdout));
  }
  return cache.get(key);
}

/** Asserts that every [label, actual, expected] pair is equal; reports how many differ and three examples. */
export function sameEverywhere(what, pairs) {
  const differ = pairs.filter(([, a, b]) => JSON.stringify(a) !== JSON.stringify(b));
  const show = v => JSON.stringify(v)?.slice(0, 300);
  assert.equal(differ.length, 0, `${what}: ${differ.length} of ${pairs.length} differ, e.g.\n` +
    differ.slice(0, 3).map(([k, a, b]) => `  ${k}\n    js: ${show(a)}\n    py: ${show(b)}`).join("\n"));
}
