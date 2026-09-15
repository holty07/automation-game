import { describe, expect, it } from 'vitest'
import { addBenchSaw, addEntity, addMill, addStockpile, addStoneCutter, addTree, createWorld, getEntity } from '../../src/sim/world'
import {
  BENCH_SAW_RECIPES,
  BUILDING_COSTS,
  CONTAINER_CAPACITY,
  MILL_RECIPES,
  STOCKPILE_CAPACITY,
  STONE_CUTTER_RECIPES,
  capacityFor,
  createBlueprint,
  lockedStockpileItem,
  recipesFor,
  stepBlueprints,
  stepMachines,
} from '../../src/sim/machines'

const PLANK_RECIPE = BENCH_SAW_RECIPES.log
const FLOUR_RECIPE = MILL_RECIPES.grain
const BLOCK_RECIPE = STONE_CUTTER_RECIPES.stone
if (PLANK_RECIPE === undefined || FLOUR_RECIPE === undefined || BLOCK_RECIPE === undefined) {
  throw new Error('expected recipes missing')
}

describe('lockedStockpileItem', () => {
  it('is null for an empty store', () => {
    expect(lockedStockpileItem({})).toBeNull()
  })

  it('is null once the one kind it held has been fully withdrawn', () => {
    expect(lockedStockpileItem({ log: 0 })).toBeNull()
  })

  it('is whichever kind currently has a positive count', () => {
    expect(lockedStockpileItem({ log: 3 })).toBe('log')
    expect(lockedStockpileItem({ plank: 1 })).toBe('plank')
  })
})

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

  it('creates a stone cutter idle and with an empty store', () => {
    const state = createWorld(5, 5, 1)
    const stoneCutterId = addStoneCutter(state, 1, 1)

    const stoneCutter = getEntity(state, stoneCutterId)
    expect(stoneCutter?.type).toBe('stoneCutter')
    expect(stoneCutter?.storage).toEqual({})
    expect(stoneCutter?.craftingUntilTick).toBeNull()
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
    benchSaw.craftingStartedTick = state.tick
    benchSaw.craftingUntilTick = state.tick + PLANK_RECIPE.ticks
    benchSaw.craftingOutput = PLANK_RECIPE.output

    for (let i = 0; i < PLANK_RECIPE.ticks; i += 1) {
      state.tick += 1
      stepMachines(state)
    }

    expect(benchSaw.craftingStartedTick).toBeNull()
    expect(benchSaw.craftingUntilTick).toBeNull()
    expect(benchSaw.craftingOutput).toBeNull()
    expect(benchSaw.storage).toEqual({ plank: 1 })
  })

  it('produces a block from a cutting stone cutter once its recipe time elapses', () => {
    const state = createWorld(5, 5, 1)
    const stoneCutterId = addStoneCutter(state, 1, 1)
    const stoneCutter = getEntity(state, stoneCutterId)
    if (stoneCutter === undefined) {
      throw new Error('stone cutter missing')
    }
    stoneCutter.craftingStartedTick = state.tick
    stoneCutter.craftingUntilTick = state.tick + BLOCK_RECIPE.ticks
    stoneCutter.craftingOutput = BLOCK_RECIPE.output

    for (let i = 0; i < BLOCK_RECIPE.ticks; i += 1) {
      state.tick += 1
      stepMachines(state)
    }

    expect(stoneCutter.craftingStartedTick).toBeNull()
    expect(stoneCutter.craftingUntilTick).toBeNull()
    expect(stoneCutter.craftingOutput).toBeNull()
    expect(stoneCutter.storage).toEqual({ block: 1 })
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

  it('never touches a non-machine entity even if it somehow has both crafting fields set', () => {
    // A tree/rock mid-harvest only ever sets craftingUntilTick, never craftingOutput (see
    // useVerb.ts) — this proves the type filter itself, independent of that convention, so a
    // future non-machine use of these fields can't silently have its timer cleared here.
    const state = createWorld(5, 5, 1)
    const treeId = addTree(state, 1, 1)
    const tree = getEntity(state, treeId)
    if (tree === undefined) {
      throw new Error('tree missing')
    }
    tree.craftingUntilTick = state.tick - 1 // already elapsed
    tree.craftingOutput = 'log'

    stepMachines(state)

    expect(getEntity(state, treeId)?.type).toBe('tree')
    expect(tree.craftingUntilTick).not.toBeNull()
    expect(tree.craftingOutput).not.toBeNull()
  })
})

describe('recipesFor', () => {
  it('returns the bench saw recipe table for a bench saw', () => {
    expect(recipesFor('benchSaw')).toBe(BENCH_SAW_RECIPES)
  })

  it('returns the stone cutter recipe table for a stone cutter', () => {
    expect(recipesFor('stoneCutter')).toBe(STONE_CUTTER_RECIPES)
  })

  it('returns the mill recipe table for a mill', () => {
    expect(recipesFor('mill')).toBe(MILL_RECIPES)
  })

  it('returns null for anything that is not a machine', () => {
    expect(recipesFor('stockpile')).toBeNull()
    expect(recipesFor('tree')).toBeNull()
  })
})

describe('BENCH_SAW_RECIPES / STONE_CUTTER_RECIPES', () => {
  it('the bench saw no longer turns stone into blocks -- that moved to the stone cutter', () => {
    expect(BENCH_SAW_RECIPES.stone).toBeUndefined()
    expect(STONE_CUTTER_RECIPES.stone?.output).toBe('block')
  })
})

describe('capacityFor', () => {
  it('gives a stockpile the larger capacity', () => {
    expect(capacityFor('stockpile')).toBe(STOCKPILE_CAPACITY)
  })

  it('gives every other storage-bearing type the smaller, generic capacity', () => {
    expect(capacityFor('benchSaw')).toBe(CONTAINER_CAPACITY)
    expect(capacityFor('stoneCutter')).toBe(CONTAINER_CAPACITY)
    expect(capacityFor('mill')).toBe(CONTAINER_CAPACITY)
    expect(capacityFor('blueprint')).toBe(CONTAINER_CAPACITY)
  })

  it('the stockpile capacity is larger than the generic one', () => {
    expect(STOCKPILE_CAPACITY).toBeGreaterThan(CONTAINER_CAPACITY)
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
    blueprint.storage = { log: (BUILDING_COSTS.stockpile.log ?? 1) - 1 }

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
    blueprint.storage = { log: BUILDING_COSTS.benchSaw.log, stone: (BUILDING_COSTS.benchSaw.stone ?? 1) - 1 }

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

  it('converts a fully-stocked stone cutter blueprint into a finished stone cutter', () => {
    const state = createWorld(5, 5, 1)
    const blueprintId = addEntity(state, createBlueprint('stoneCutter', { x: 2, y: 3 }))
    const blueprint = getEntity(state, blueprintId)
    if (blueprint === undefined) {
      throw new Error('blueprint missing')
    }
    blueprint.storage = { ...BUILDING_COSTS.stoneCutter }

    stepBlueprints(state)

    const finished = getEntity(state, blueprintId)
    expect(finished?.type).toBe('stoneCutter')
    expect(finished?.blueprintOf).toBeNull()
    expect(finished?.storage).toEqual({})
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

  it('converts a fully-stocked bot blueprint into a running bot with a fresh, empty program', () => {
    const state = createWorld(5, 5, 1)
    const blueprintId = addEntity(state, createBlueprint('bot', { x: 3, y: 4 }))
    const blueprint = getEntity(state, blueprintId)
    if (blueprint === undefined) {
      throw new Error('blueprint missing')
    }
    blueprint.storage = { ...BUILDING_COSTS.bot }

    stepBlueprints(state)

    const finished = getEntity(state, blueprintId)
    expect(finished?.type).toBe('bot')
    expect(finished?.blueprintOf).toBeNull()
    expect(finished?.storage).toEqual({})

    const runtime = state.botRuntimes[blueprintId]
    if (runtime === undefined) {
      throw new Error('bot runtime missing')
    }
    expect(runtime.status).toBe('running')
    expect(runtime.paused).toBe(false)
    const program = state.programs[runtime.programId]
    expect(program?.instructions).toEqual([])
  })

  it('leaves non-blueprint entities alone', () => {
    const state = createWorld(5, 5, 1)
    const stockpileId = addStockpile(state, 1, 1)

    expect(() => stepBlueprints(state)).not.toThrow()
    expect(getEntity(state, stockpileId)?.type).toBe('stockpile')
  })
})
