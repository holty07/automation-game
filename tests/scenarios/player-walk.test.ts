import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { load } from '../../src/sim/serialise'
import { tick } from '../../src/sim/tick'
import { textDump } from '../../src/debug/textDump'

describe('player walk scenario', () => {
  it('walks to its move target and stops', () => {
    const json = readFileSync(new URL('../fixtures/player-walk.json', import.meta.url), 'utf8')
    const state = load(json)

    for (let i = 0; i < 100; i += 1) {
      tick(state)
    }

    const player = state.entities.find((entity) => entity.id === 0)
    expect(player?.pos).toEqual({ x: 4, y: 3 })
    expect(player?.moveTarget).toBeNull()

    const dump = textDump(state)
    expect(dump).toContain('id=0 type=player pos=(4,3) moveTarget=none')
  })
})
