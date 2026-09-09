export interface Rng {
  next(): number
  nextInt(max: number): number
  state: number
}

export function createRng(seed: number): Rng {
  const rng: Rng = {
    state: seed >>> 0,
    next(): number {
      rng.state = (rng.state + 0x6d2b79f5) >>> 0
      let t = rng.state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    nextInt(max: number): number {
      return Math.floor(rng.next() * max)
    },
  }
  return rng
}
