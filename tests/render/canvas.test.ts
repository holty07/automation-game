import { describe, expect, it } from 'vitest'
import { addBenchSaw, addPlayer, addTree, createWorld, getEntity } from '../../src/sim/world'
import { MOVE_TICKS_PER_TILE, stepMovement } from '../../src/sim/movement'
import { craftingProgressFraction, interpolatedPos } from '../../src/render/canvas'

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

describe('craftingProgressFraction', () => {
  it('is null for an entity with no timed process running', () => {
    const state = createWorld(5, 5, 1)
    const treeId = addTree(state, 1, 1)
    const tree = getEntity(state, treeId)
    if (tree === undefined) {
      throw new Error('tree missing')
    }
    expect(craftingProgressFraction(state, tree)).toBeNull()
  })

  it('derives the same 0..1 fraction for any timed process, whatever the entity type or duration', () => {
    const state = createWorld(5, 5, 1)
    state.tick = 100

    const treeId = addTree(state, 1, 1)
    const tree = getEntity(state, treeId)
    const benchSawId = addBenchSaw(state, 2, 2)
    const benchSaw = getEntity(state, benchSawId)
    if (tree === undefined || benchSaw === undefined) {
      throw new Error('entity missing')
    }

    // A chop with 40 ticks left of an 80-tick duration.
    tree.craftingStartedTick = 60
    tree.craftingUntilTick = 140
    expect(craftingProgressFraction(state, tree)).toBeCloseTo(0.5, 5)

    // A machine recipe with a completely different duration — the same computation applies.
    benchSaw.craftingStartedTick = 90
    benchSaw.craftingUntilTick = 100
    benchSaw.craftingOutput = 'plank'
    expect(craftingProgressFraction(state, benchSaw)).toBeCloseTo(1, 5)
  })

  it('is null when craftingStartedTick is missing (an old save from before it existed), even with craftingUntilTick set', () => {
    const state = createWorld(5, 5, 1)
    const benchSawId = addBenchSaw(state, 2, 2)
    const benchSaw = getEntity(state, benchSawId)
    if (benchSaw === undefined) {
      throw new Error('bench saw missing')
    }
    benchSaw.craftingUntilTick = 200
    benchSaw.craftingOutput = 'plank'
    // Simulates JSON.parse of a save file predating craftingStartedTick: the field is simply
    // absent, not null.
    delete (benchSaw as { craftingStartedTick?: number | null }).craftingStartedTick

    expect(craftingProgressFraction(state, benchSaw)).toBeNull()
  })
})
