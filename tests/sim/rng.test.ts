import { describe, expect, it } from 'vitest'
import { createRng } from '../../src/sim/rng'

describe('createRng', () => {
  it('same seed produces the same sequence', () => {
    const a = createRng(42)
    const b = createRng(42)

    const seqA = [a.next(), a.next(), a.next()]
    const seqB = [b.next(), b.next(), b.next()]

    expect(seqA).toEqual(seqB)
  })

  it('different seeds diverge', () => {
    const a = createRng(1)
    const b = createRng(2)

    const seqA = [a.next(), a.next(), a.next()]
    const seqB = [b.next(), b.next(), b.next()]

    expect(seqA).not.toEqual(seqB)
  })
})
