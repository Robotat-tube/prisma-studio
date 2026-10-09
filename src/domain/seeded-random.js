/**
 * A seeded random sample (Mersenne Twister MT19937 with the standard integer
 * seeding and sampling algorithm). The second-reviewer sample is reported with its seed; the same seed must
 * always draw the same records.
 * @module domain/seeded-random
 */

class MersenneTwister {
  #mt = new Uint32Array(624);
  #index = 625;

  /** init_by_array(key) for a non-negative integer seed (32-bit chunks, least significant first). */
  constructor(seed) {
    let n = BigInt(seed);
    if (n < 0n) n = -n;
    const key = [];
    do { key.push(Number(n & 0xffffffffn)); n >>= 32n; } while (n > 0n);
    this.#initByArray(key);
  }

  #initGenrand(s) {
    const mt = this.#mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < 624; i++) mt[i] = (Math.imul(1812433253, mt[i - 1] ^ (mt[i - 1] >>> 30)) + i) >>> 0;
    this.#index = 624;
  }

  #initByArray(key) {
    const mt = this.#mt;
    this.#initGenrand(19650218);
    let i = 1, j = 0;
    for (let k = Math.max(624, key.length); k; k--) {
      mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + key[j] + j) >>> 0;
      i++; j++;
      if (i >= 624) { mt[0] = mt[623]; i = 1; }
      if (j >= key.length) j = 0;
    }
    for (let k = 623; k; k--) {
      mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i) >>> 0;
      i++;
      if (i >= 624) { mt[0] = mt[623]; i = 1; }
    }
    mt[0] = 0x80000000;
  }

  /** genrand_uint32 */
  next32() {
    const mt = this.#mt;
    if (this.#index >= 624) {
      for (let k = 0; k < 624; k++) {
        const y = (mt[k] & 0x80000000) | (mt[(k + 1) % 624] & 0x7fffffff);
        mt[k] = mt[(k + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      this.#index = 0;
    }
    let y = mt[this.#index++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }
}

/** Random.getrandbits(k) for 0 < k ≤ 32 */
const randomBits = (mt, k) => mt.next32() >>> (32 - k);

/** Random._randbelow(n) for 0 < n < 2^32 */
function randomBelow(mt, n) {
  const k = n.toString(2).length;
  let r = randomBits(mt, k);
  while (r >= n) r = randomBits(mt, k);
  return r;
}

/**
 * random.Random(seed).sample(population, k)
 * @template T @param {number|bigint} seed @param {T[]} population @param {number} k @returns {T[]}
 */
export function sample(seed, population, k) {
  const n = population.length;
  if (k < 0 || k > n) throw new RangeError("Sample larger than population or is negative");
  if (n >= 2 ** 32) throw new RangeError("Population too large");
  const mt = new MersenneTwister(seed);
  const result = new Array(k);
  let setSize = 21;
  if (k > 5) setSize += 4 ** Math.ceil(Math.log(k * 3) / Math.log(4));
  if (n <= setSize) {
    const pool = [...population];
    for (let i = 0; i < k; i++) {
      const j = randomBelow(mt, n - i);
      result[i] = pool[j];
      pool[j] = pool[n - i - 1];
    }
  } else {
    const selected = new Set();
    for (let i = 0; i < k; i++) {
      let j = randomBelow(mt, n);
      while (selected.has(j)) j = randomBelow(mt, n);
      selected.add(j);
      result[i] = population[j];
    }
  }
  return result;
}
