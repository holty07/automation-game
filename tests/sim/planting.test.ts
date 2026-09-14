import { describe, expect, it } from 'vitest'
import { createYoungTree, plant, stepTreeGrowth, TREE_GROW_TICKS } from '../../src/sim/planting'
import { addEntity, addPlayer, addTree, createWorld, getEntity } from '../../src/sim/world'

describe('createYoungTree', () => {
  it('creates a young tree as an idle, non-timed fixture — stepTreeGrowth (not the factory) starts its timer', () => {
    const data = createYoungTree({ x: 1, y: 1 })
    expect(data.craftingUntilTick).toBeNull()
    expect(data.storage).toBeNull()
  })
})

describe('plant', () => {
  it('rejects planting when not holding a sapling', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const player = getEntity(state, playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }

    const result = plant(state, player, { x: 2, y: 1 })

    expect(result).toEqual({ ok: false, reason: 'not holding a sapling' })
  })

  it('rejects a target that is not adjacent', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 0, 0)
    const player = getEntity(state, playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    player.held = 'sapling'

    const result = plant(state, player, { x: 4, y: 4 })

    expect(result).toEqual({ ok: false, reason: 'target is out of reach' })
  })

  it('rejects an occupied target tile', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const player = getEntity(state, playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    player.held = 'sapling'
    addTree(state, 2, 1)

    const result = plant(state, player, { x: 2, y: 1 })

    expect(result).toEqual({ ok: false, reason: 'target is occupied' })
  })

  it('plants a young tree, consuming the held sapling and starting its growth timer', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const player = getEntity(state, playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    player.held = 'sapling'

    const result = plant(state, player, { x: 2, y: 1 })

    expect(result.ok).toBe(true)
    expect(player.held).toBeNull()
    const youngTree = state.entities.find((entity) => entity.id === result.producedEntityId)
    expect(youngTree?.type).toBe('youngTree')
    expect(youngTree?.pos).toEqual({ x: 2, y: 1 })
    expect(youngTree?.craftingUntilTick).toBe(state.tick + TREE_GROW_TICKS)
  })
})

describe('stepTreeGrowth', () => {
  it('leaves a young tree alone until its growth timer elapses', () => {
    const state = createWorld(5, 5, 1)
    const youngTreeId = addEntity(state, createYoungTree({ x: 2, y: 2 }))
    const youngTree = getEntity(state, youngTreeId)
    if (youngTree === undefined) {
      throw new Error('young tree missing')
    }
    youngTree.craftingUntilTick = state.tick + TREE_GROW_TICKS

    for (let i = 0; i < TREE_GROW_TICKS - 1; i += 1) {
      state.tick += 1
      stepTreeGrowth(state)
    }

    expect(getEntity(state, youngTreeId)?.type).toBe('youngTree')
    expect(state.entities.some((entity) => entity.type === 'tree')).toBe(false)
  })

  it('matures a young tree into a full tree at the same position once its timer elapses', () => {
    const state = createWorld(5, 5, 1)
    const youngTreeId = addEntity(state, createYoungTree({ x: 2, y: 2 }))
    const youngTree = getEntity(state, youngTreeId)
    if (youngTree === undefined) {
      throw new Error('young tree missing')
    }
    youngTree.craftingUntilTick = state.tick + TREE_GROW_TICKS

    for (let i = 0; i < TREE_GROW_TICKS; i += 1) {
      state.tick += 1
      stepTreeGrowth(state)
    }

    expect(getEntity(state, youngTreeId)).toBeUndefined()
    const tree = state.entities.find((entity) => entity.type === 'tree')
    expect(tree?.pos).toEqual({ x: 2, y: 2 })
  })

  it('never touches non-young-tree entities, even ones with a craftingUntilTick set', () => {
    const state = createWorld(5, 5, 1)
    const treeId = addTree(state, 1, 1)

    expect(() => stepTreeGrowth(state)).not.toThrow()
    expect(getEntity(state, treeId)?.type).toBe('tree')
  })
})
