export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x12345678;
  }

  nextUint32(): number {
    // xorshift32
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  nextFloat01(): number {
    return this.nextUint32() / 0xffffffff;
  }

  int(minInclusive: number, maxInclusive: number): number {
    const r = this.nextUint32();
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + (r % span);
  }

  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  alpha(n: number): string {
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let s = "";
    for (let i = 0; i < n; i++) s += A[this.int(0, A.length - 1)];
    return s;
  }

  digits(n: number): string {
    let s = "";
    for (let i = 0; i < n; i++) s += String(this.int(0, 9));
    return s;
  }
}
