/**
 * A pseudo-random number generator using the xorshift32 algorithm.
 * 
 * @class Rng
 * @example
 * const rng = new Rng(12345);
 * const randomInt = rng.int(1, 100);
 * const randomLetter = rng.pick(['A', 'B', 'C']);
 */
class Rng {
  /**
   * The internal state of the random number generator.
   * @private
   */
  private state: number;

  /**
   * Creates a new instance of the Rng class.
   * 
   * @param {number} seed - The seed value for the random number generator. If seed is 0, it defaults to 0x12345678.
   */
  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x12345678;
  }

  /**
   * Generates the next unsigned 32-bit integer.
   * Uses the xorshift32 algorithm to produce the next random value.
   * 
   * @returns {number} A random unsigned 32-bit integer.
   */
  nextUint32(): number {
    // xorshift32
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  /**
   * Generates a random floating-point number between 0 (inclusive) and 1 (exclusive).
   * 
   * @returns {number} A random number in the range [0, 1).
   */
  nextFloat01(): number {
    return this.nextUint32() / 0xffffffff;
  }

  /**
   * Generates a random integer within the specified inclusive range.
   * 
   * @param {number} minInclusive - The minimum value (inclusive).
   * @param {number} maxInclusive - The maximum value (inclusive).
   * @returns {number} A random integer between minInclusive and maxInclusive.
   */
  int(minInclusive: number, maxInclusive: number): number {
    const r = this.nextUint32();
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + (r % span);
  }

  /**
   * Randomly selects an element from the provided array.
   * 
   * @template T - The type of elements in the array.
   * @param {T[]} arr - The array to pick from.
   * @returns {T} A random element from the array.
   */
  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /**
   * Generates a random string of uppercase alphabetic characters.
   * 
   * @param {number} n - The length of the string to generate.
   * @returns {string} A random string of n uppercase letters.
   */
  alpha(n: number): string {
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let s = "";
    for (let i = 0; i < n; i++) s += A[this.int(0, A.length - 1)];
    return s;
  }

  /**
   * Generates a random string of digit characters.
   * 
   * @param {number} n - The length of the string to generate.
   * @returns {string} A random string of n digits (0-9).
   */
  digits(n: number): string {
    let s = "";
    for (let i = 0; i < n; i++) s += String(this.int(0, 9));
    return s;
  }
}

export { Rng };