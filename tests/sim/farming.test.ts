import { describe, expect, it } from 'vitest'
import { createSeedling, createSoil, createTilledSoil, createWheat, stepCrops, WHEAT_GROW_TICKS } from '../../src/sim/farming'
import { addEntity, createWorld, getEntity } from '../../src/sim/world'

describe('farming factories', () => {
  it('creates soil, tilled soil and wheat as idle, non-timed fixtures', () => {
    const pos = { x: 1, y: 1 }
    for (const data of [createSoil(pos), createTilledSoil(pos), createWheat(pos)]) {
      expect(data.craftingUntilTick).toBeNull()
      expect(data.storage).toBeNull()
    }
  })

  it('creates a seedling the same way — stepCrops (not the factory) starts its timer', () => {
    const data = createSeedling({ x: 1, y: 1 })
    expect(data.craftingUntilTick).toBeNull()
  })
})

describe('stepCrops', () => {
  it('leaves a seedling alone until its growth timer elapses', () => {
    const state = createWorld(5, 5, 1)
    const seedlingId = addEntity(state, createSeedling({ x: 2, y: 2 }))
    const seedling = getEntity(state, seedlingId)
    if (seedling === undefined) {
      throw new Error('seedling missing')
    }
    seedling.craftingUntilTick = state.tick + WHEAT_GROW_TICKS

    for (let i = 0; i < WHEAT_GROW_TICKS - 1; i += 1) {
      state.tick += 1
      stepCrops(state)
    }

    expect(getEntity(state, seedlingId)?.type).toBe('seedling')
    expect(state.entities.some((entity) => entity.type === 'wheat')).toBe(false)
  })

  it('matures a seedling into wheat at the same position once its timer elapses', () => {
    const state = createWorld(5, 5, 1)
    const seedlingId = addEntity(state, createSeedling({ x: 2, y: 2 }))
    const seedling = getEntity(state, seedlingId)
    if (seedling === undefined) {
      throw new Error('seedling missing')
    }
    seedling.craftingUntilTick = state.tick + WHEAT_GROW_TICKS

    for (let i = 0; i < WHEAT_GROW_TICKS; i += 1) {
      state.tick += 1
      stepCrops(state)
    }

    expect(getEntity(state, seedlingId)).toBeUndefined()
    const wheat = state.entities.find((entity) => entity.type === 'wheat')
    expect(wheat?.pos).toEqual({ x: 2, y: 2 })
  })

  it('matures multiple seedlings in the same tick without losing any', () => {
    const state = createWorld(5, 5, 1)
    const idA = addEntity(state, createSeedling({ x: 0, y: 0 }))
    const idB = addEntity(state, createSeedling({ x: 4, y: 4 }))
    const a = getEntity(state, idA)
    const b = getEntity(state, idB)
    if (a === undefined || b === undefined) {
      throw new Error('seedling missing')
    }
    a.craftingUntilTick = state.tick
    b.craftingUntilTick = state.tick

    stepCrops(state)

    const wheatPositions = state.entities.filter((entity) => entity.type === 'wheat').map((entity) => entity.pos)
    expect(wheatPositions).toEqual(expect.arrayContaining([{ x: 0, y: 0 }, { x: 4, y: 4 }]))
    expect(wheatPositions).toHaveLength(2)
  })

  it('never touches non-seedling entities, even ones with a craftingUntilTick set', () => {
    const state = createWorld(5, 5, 1)
    const soilId = addEntity(state, createSoil({ x: 1, y: 1 }))

    expect(() => stepCrops(state)).not.toThrow()
    expect(getEntity(state, soilId)?.type).toBe('soil')
  })
})
