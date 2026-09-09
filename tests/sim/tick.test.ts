import { describe, expect, it } from 'vitest'
import { createWorld } from '../../src/sim/world'
import { tick } from '../../src/sim/tick'

describe('tick', () => {
  it('100 ticks on an empty world changes nothing but state.tick', () => {
    const state = createWorld(16, 16, 1)

    const widthBefore = state.width
    const heightBefore = state.height
    const tilesBefore = [...state.tiles]
    const entitiesBefore = JSON.parse(JSON.stringify(state.entities))
    const nextEntityIdBefore = state.nextEntityId
    const seedBefore = state.seed
    const rngStateBefore = state.rng.state

    for (let i = 0; i < 100; i += 1) {
      tick(state)
    }

    expect(state.tick).toBe(100)
    expect(state.width).toBe(widthBefore)
    expect(state.height).toBe(heightBefore)
    expect(state.tiles).toEqual(tilesBefore)
    expect(state.entities).toEqual(entitiesBefore)
    expect(state.nextEntityId).toBe(nextEntityIdBefore)
    expect(state.seed).toBe(seedBefore)
    expect(state.rng.state).toBe(rngStateBefore)
  })
})
