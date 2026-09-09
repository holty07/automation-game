import { describe, expect, it } from 'vitest'
import { addPlayer, createWorld } from '../../src/sim/world'
import { MOVE_TICKS_PER_TILE, setMoveTarget, stepMovement } from '../../src/sim/movement'

describe('movement', () => {
  it('clamps a move target to the world bounds', () => {
    const state = createWorld(8, 8, 1)
    const playerId = addPlayer(state, 0, 0)

    setMoveTarget(state, playerId, { x: 99, y: -5 })

    const player = state.entities.find((entity) => entity.id === playerId)
    expect(player?.moveTarget).toEqual({ x: 7, y: 0 })
  })

  it('moves one tile every MOVE_TICKS_PER_TILE ticks, x before y', () => {
    const state = createWorld(8, 8, 1)
    const playerId = addPlayer(state, 0, 0)
    setMoveTarget(state, playerId, { x: 1, y: 1 })

    for (let i = 0; i < MOVE_TICKS_PER_TILE - 1; i += 1) {
      stepMovement(state)
    }
    let player = state.entities.find((entity) => entity.id === playerId)
    expect(player?.pos).toEqual({ x: 0, y: 0 })

    stepMovement(state)
    player = state.entities.find((entity) => entity.id === playerId)
    expect(player?.pos).toEqual({ x: 1, y: 0 })
    expect(player?.prevPos).toEqual({ x: 0, y: 0 })
    expect(player?.moveTarget).toEqual({ x: 1, y: 1 })

    for (let i = 0; i < MOVE_TICKS_PER_TILE; i += 1) {
      stepMovement(state)
    }
    player = state.entities.find((entity) => entity.id === playerId)
    expect(player?.pos).toEqual({ x: 1, y: 1 })
    expect(player?.moveTarget).toBeNull()
  })

  it('starts a fresh entity with a full cooldown so every step takes the same time', () => {
    const state = createWorld(8, 8, 1)
    const playerId = addPlayer(state, 0, 0)
    const player = state.entities.find((entity) => entity.id === playerId)
    expect(player?.moveCooldown).toBe(MOVE_TICKS_PER_TILE - 1)
  })

  it('does nothing once the entity has arrived', () => {
    const state = createWorld(8, 8, 1)
    const playerId = addPlayer(state, 2, 2)
    setMoveTarget(state, playerId, { x: 2, y: 2 })

    stepMovement(state)

    const player = state.entities.find((entity) => entity.id === playerId)
    expect(player?.pos).toEqual({ x: 2, y: 2 })
    expect(player?.moveTarget).toBeNull()
  })

  it('ignores a moveTarget for an unknown entity id', () => {
    const state = createWorld(8, 8, 1)

    expect(() => setMoveTarget(state, 999, { x: 1, y: 1 })).not.toThrow()
  })
})
