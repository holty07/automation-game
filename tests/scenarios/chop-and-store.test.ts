import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { load } from '../../src/sim/serialise'
import { tick } from '../../src/sim/tick'
import { textDump } from '../../src/debug/textDump'
import type { SimState } from '../../src/sim/types'

function runTicks(state: SimState, count: number): void {
  for (let i = 0; i < count; i += 1) {
    tick(state)
  }
}

describe('chop and store scenario', () => {
  it('a bot running a hand-written chop-and-store program produces the exact expected world state', () => {
    const json = readFileSync(new URL('../fixtures/chop-and-store.json', import.meta.url), 'utf8')
    const state = load(json)

    runTicks(state, 500)

    expect(textDump(state)).toMatchInlineSnapshot(`
      "tick: 500
      grid:
      ..........
      ..........
      ..........
      ..........
      ..........
      ..........
      ..........
      ..........
      ..........
      ..........
      entities:
        1. id=0 type=tree pos=(7,2) moveTarget=none held=none
        2. id=6 type=stockpile pos=(1,5) moveTarget=none held=none storage=log=4
        3. id=7 type=bot pos=(7,7) moveTarget=(7,6) held=log
      bots:
        1. bot=7 program=chop and store path=1.5 status=running"
    `)
  })
})
