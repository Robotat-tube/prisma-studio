/**
 * Requests to the OpenAlex API: calls are spaced out (4 per second), retried on 429 and server errors,
 * and a clear message is given when the anonymous daily budget is used up.
 * @module services/openalex-client
 */
import { API } from "../domain/openalex.js";

export class OpenAlexError extends Error {}

const defaultWait = ms => new Promise(resolve => setTimeout(resolve, ms));

export class OpenAlexClient {
  #lastCall = -Infinity;

  /**
   * @param {object} p
   * @param {import("../ports/http.js").Http} p.http
   * @param {string} [p.apiKey] free OpenAlex key: raises the daily budget
   * @param {(ms: number) => Promise<void>} [p.wait] how to pause (injected so tests do not wait)
   * @param {() => number} [p.monotonic] milliseconds from a steady clock
   */
  constructor({ http, apiKey = "", wait = defaultWait, monotonic = () => performance.now() }) {
    Object.assign(this, { http, apiKey, wait, monotonic });
  }

  /** GET <API>/<path>?<params> as JSON. */
  async get(path, params = {}) {
    const query = new URLSearchParams(Object.entries(this.apiKey ? { ...params, api_key: this.apiKey } : params).map(([k, v]) => [k, String(v)]));
    const url = `${API}/${path}` + (query.size ? `?${query}` : "");
    for (let attempt = 0; attempt < 6; attempt++) {
      const pause = 250 - (this.monotonic() - this.#lastCall);
      if (pause > 0) await this.wait(pause);
      this.#lastCall = this.monotonic();
      const res = await this.http.get(url, { "User-Agent": "prisma-studio" });
      if (res.status >= 200 && res.status < 300) return res.json();
      if (res.status === 429 && res.header("X-RateLimit-Remaining") === "0") {
        throw new OpenAlexError("OpenAlex daily budget used up — try again tomorrow, or set a free API key (see openalex.org).");
      }
      if (![429, 500, 502, 503, 504].includes(res.status) || attempt === 5) throw new OpenAlexError(`OpenAlex answered ${res.status} for ${path}`);
      await this.wait((Number(res.header("Retry-After")) || 2 ** attempt) * 1000);
    }
    throw new OpenAlexError("OpenAlex did not answer");
  }
}
