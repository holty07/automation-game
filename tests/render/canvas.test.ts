import { describe, expect, it } from 'vitest'
import { addPlayer, createWorld, getEntity } from '../../src/sim/world'
import { MOVE_TICKS_PER_TILE, stepMovement } from '../../src/sim/movement'
import { interpolatedPos } from '../../src/render/canvas'

describe('interpolatedPos', () => {
  it('holds still when not moving', () => {
    const state = createWorld(8, 8, 1)
    const playerId = addPlayer(state, 2, 2)
    const player = getEntity(state, playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }

    expect(interpolatedPos(player, 0)).toEqual({ x: 2, y: 2 })
    expect(interpolatedPos(player, 0.99)).toEqual({ x: 2, y: 2 })
  })

  it('advances smoothly across every tick of a tile step, not just the last one', () => {
    const state = createWorld(8, 8, 1)
    const playerId = addPlayer(state, 0, 0)
    const player = getEntity(state, playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    player.moveTarget = { x: 1, y: 0 }

    const samples: number[] = []
    for (let step = 0; step < MOVE_TICKS_PER_TILE; step += 1) {
      samples.push(interpolatedPos(player, 0).x)
      samples.push(interpolatedPos(player, 0.5).x)
      stepMovement(state)
    }

    // Every sample should be a distinct, increasing fraction of the tile — no long flat
    // stretch followed by a jump.
    for (let i = 1; i < samples.length; i += 1) {
      const previous = samples[i - 1]
      const current = samples[i]
      if (previous === undefined || current === undefined) {
        throw new Error('missing sample')
      }
      expect(current).toBeGreaterThan(previous)
    }
    const first = samples[0]
    const last = samples[samples.length - 1]
    if (first === undefined || last === undefined) {
      throw new Error('missing sample')
    }
    expect(first).toBeCloseTo(0, 5)
    expect(last).toBeLessThan(1)
  })
})
