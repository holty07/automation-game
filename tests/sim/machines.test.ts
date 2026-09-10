import { describe, expect, it } from 'vitest'
import { addBenchSaw, addEntity, addMill, addStockpile, createWorld, getEntity } from '../../src/sim/world'
import { BENCH_SAW_RECIPES, BUILDING_COSTS, MILL_RECIPES, createBlueprint, recipesFor, stepBlueprints, stepMachines } from '../../src/sim/machines'

const PLANK_RECIPE = BENCH_SAW_RECIPES.log
const FLOUR_RECIPE = MILL_RECIPES.grain
if (PLANK_RECIPE === undefined || FLOUR_RECIPE === undefined) {
  throw new Error('expected recipes missing')
}

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

  it('creates a mill idle and with an empty store', () => {
    const state = createWorld(5, 5, 1)
    const millId = addMill(state, 1, 1)

    const mill = getEntity(state, millId)
    expect(mill?.type).toBe('mill')
    expect(mill?.storage).toEqual({})
    expect(mill?.craftingUntilTick).toBeNull()
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
    benchSaw.craftingUntilTick = state.tick + PLANK_RECIPE.ticks
    benchSaw.craftingOutput = PLANK_RECIPE.output

    for (let i = 0; i < PLANK_RECIPE.ticks - 1; i += 1) {
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
    benchSaw.craftingUntilTick = state.tick + PLANK_RECIPE.ticks
    benchSaw.craftingOutput = PLANK_RECIPE.output

    for (let i = 0; i < PLANK_RECIPE.ticks; i += 1) {
      state.tick += 1
      stepMachines(state)
    }

    expect(benchSaw.craftingUntilTick).toBeNull()
    expect(benchSaw.craftingOutput).toBeNull()
    expect(benchSaw.storage).toEqual({ plank: 1 })
  })

  it('produces flour from a milling mill once its recipe time elapses', () => {
    const state = createWorld(5, 5, 1)
    const millId = addMill(state, 1, 1)
    const mill = getEntity(state, millId)
    if (mill === undefined) {
      throw new Error('mill missing')
    }
    mill.craftingUntilTick = state.tick + FLOUR_RECIPE.ticks
    mill.craftingOutput = FLOUR_RECIPE.output

    for (let i = 0; i < FLOUR_RECIPE.ticks; i += 1) {
      state.tick += 1
      stepMachines(state)
    }

    expect(mill.craftingUntilTick).toBeNull()
    expect(mill.storage).toEqual({ flour: 1 })
  })

  it('never touches a timed entity with no recorded output, such as a growing seedling', () => {
    const state = createWorld(5, 5, 1)
    const benchSawId = addBenchSaw(state, 1, 1)
    const benchSaw = getEntity(state, benchSawId)
    if (benchSaw === undefined) {
      throw new Error('bench saw missing')
    }
    benchSaw.craftingUntilTick = state.tick - 1 // already elapsed
    // craftingOutput deliberately left null, as a growing seedling's would be.

    expect(() => stepMachines(state)).not.toThrow()
    expect(benchSaw.craftingUntilTick).not.toBeNull()
    expect(benchSaw.storage).toEqual({})
  })
})

describe('recipesFor', () => {
  it('returns the bench saw recipe table for a bench saw', () => {
    expect(recipesFor('benchSaw')).toBe(BENCH_SAW_RECIPES)
  })

  it('returns the mill recipe table for a mill', () => {
    expect(recipesFor('mill')).toBe(MILL_RECIPES)
  })

  it('returns null for anything that is not a machine', () => {
    expect(recipesFor('stockpile')).toBeNull()
    expect(recipesFor('tree')).toBeNull()
  })
})

describe('blueprints', () => {
  it('creates a blueprint with an empty store, holding its target building', () => {
    const state = createWorld(5, 5, 1)
    const blueprintId = addEntity(state, createBlueprint('stockpile', { x: 1, y: 1 }))

    const blueprint = getEntity(state, blueprintId)
    expect(blueprint?.type).toBe('blueprint')
    expect(blueprint?.blueprintOf).toBe('stockpile')
    expect(blueprint?.storage).toEqual({})
  })

  it('leaves an under-stocked blueprint alone', () => {
    const state = createWorld(5, 5, 1)
    const blueprintId = addEntity(state, createBlueprint('stockpile', { x: 1, y: 1 }))
    const blueprint = getEntity(state, blueprintId)
    if (blueprint === undefined) {
      throw new Error('blueprint missing')
    }
    blueprint.storage = { plank: (BUILDING_COSTS.stockpile.plank ?? 1) - 1 }

    stepBlueprints(state)

    expect(getEntity(state, blueprintId)?.type).toBe('blueprint')
  })

  it('leaves a multi-item blueprint alone when one item is fully delivered but another is still short', () => {
    const state = createWorld(5, 5, 1)
    const blueprintId = addEntity(state, createBlueprint('benchSaw', { x: 1, y: 1 }))
    const blueprint = getEntity(state, blueprintId)
    if (blueprint === undefined) {
      throw new Error('blueprint missing')
    }
    blueprint.storage = { plank: BUILDING_COSTS.benchSaw.plank, block: (BUILDING_COSTS.benchSaw.block ?? 1) - 1 }

    stepBlueprints(state)

    expect(getEntity(state, blueprintId)?.type).toBe('blueprint')
  })

  it('converts a fully-stocked blueprint into its finished building, at the same id and position, resetting storage', () => {
    const state = createWorld(5, 5, 1)
    const blueprintId = addEntity(state, createBlueprint('benchSaw', { x: 2, y: 3 }))
    const blueprint = getEntity(state, blueprintId)
    if (blueprint === undefined) {
      throw new Error('blueprint missing')
    }
    blueprint.storage = { ...BUILDING_COSTS.benchSaw }

    stepBlueprints(state)

    const finished = getEntity(state, blueprintId)
    expect(finished?.type).toBe('benchSaw')
    expect(finished?.blueprintOf).toBeNull()
    expect(finished?.storage).toEqual({})
    expect(finished?.pos).toEqual({ x: 2, y: 3 })
  })

  it('converts once storage meets or exceeds every required item, not just equals it', () => {
    const state = createWorld(5, 5, 1)
    const blueprintId = addEntity(state, createBlueprint('mill', { x: 0, y: 0 }))
    const blueprint = getEntity(state, blueprintId)
    if (blueprint === undefined) {
      throw new Error('blueprint missing')
    }
    blueprint.storage = {
      plank: (BUILDING_COSTS.mill.plank ?? 0) + 5,
      block: (BUILDING_COSTS.mill.block ?? 0) + 5,
    }

    stepBlueprints(state)

    expect(getEntity(state, blueprintId)?.type).toBe('mill')
  })

  it('leaves non-blueprint entities alone', () => {
    const state = createWorld(5, 5, 1)
    const stockpileId = addStockpile(state, 1, 1)

    expect(() => stepBlueprints(state)).not.toThrow()
    expect(getEntity(state, stockpileId)?.type).toBe('stockpile')
  })
})
