import { describe, expect, it } from 'vitest'
import { addBenchSaw, addStockpile, createWorld, getEntity } from '../../src/sim/world'
import { BENCH_SAW_RECIPE, stepMachines } from '../../src/sim/machines'

describe('machines', () => {
  it('creates a stockpile with an empty store', () => {
    const state = createWorld(5, 5, 1)
    const stockpileId = addStockpile(state, 1, 1)

    const stockpile = getEntity(state, stockpileId)
    expect(stockpile?.type).toBe('stockpile')
    expect(stockpile?.storage).toEqual({})
  })

  it('creates a bench saw idle and with an empty store', () => {
    const state = createWorld(5, 5, 1)
    const benchSawId = addBenchSaw(state, 1, 1)

    const benchSaw = getEntity(state, benchSawId)
    expect(benchSaw?.type).toBe('benchSaw')
    expect(benchSaw?.storage).toEqual({})
    expect(benchSaw?.craftingUntilTick).toBeNull()
  })

  it('leaves an idle bench saw alone', () => {
    const state = createWorld(5, 5, 1)
    const benchSawId = addBenchSaw(state, 1, 1)

    stepMachines(state)

    const benchSaw = getEntity(state, benchSawId)
    expect(benchSaw?.storage).toEqual({})
  })

  it('leaves a crafting bench saw alone until its recipe time has elapsed', () => {
    const state = createWorld(5, 5, 1)
    const benchSawId = addBenchSaw(state, 1, 1)
    const benchSaw = getEntity(state, benchSawId)
    if (benchSaw === undefined) {
      throw new Error('bench saw missing')
    }
    benchSaw.craftingUntilTick = state.tick + BENCH_SAW_RECIPE.ticks

    for (let i = 0; i < BENCH_SAW_RECIPE.ticks - 1; i += 1) {
      state.tick += 1
      stepMachines(state)
    }

    expect(benchSaw.craftingUntilTick).not.toBeNull()
    expect(benchSaw.storage).toEqual({})
  })

  it('produces a plank and goes idle once the recipe time elapses', () => {
    const state = createWorld(5, 5, 1)
    const benchSawId = addBenchSaw(state, 1, 1)
    const benchSaw = getEntity(state, benchSawId)
    if (benchSaw === undefined) {
      throw new Error('bench saw missing')
    }
    benchSaw.craftingUntilTick = state.tick + BENCH_SAW_RECIPE.ticks

    for (let i = 0; i < BENCH_SAW_RECIPE.ticks; i += 1) {
      state.tick += 1
      stepMachines(state)
    }

    expect(benchSaw.craftingUntilTick).toBeNull()
    expect(benchSaw.storage).toEqual({ plank: 1 })
  })
})
