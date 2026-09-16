import { describe, expect, it } from 'vitest'
import {
  addBenchSaw,
  addCircuitBench,
  addCoreForge,
  addEntity,
  addGearPress,
  addMill,
  addStockpile,
  addStoneCutter,
  addToolBench,
  addTree,
  createWorld,
  getEntity,
} from '../../src/sim/world'
import {
  BENCH_SAW_RECIPES,
  BUILDING_COSTS,
  CIRCUIT_BENCH_RECIPES,
  CONTAINER_CAPACITY,
  CORE_FORGE_RECIPES,
  GEAR_PRESS_RECIPES,
  MILL_RECIPES,
  STOCKPILE_CAPACITY,
  STONE_CUTTER_RECIPES,
  TOOL_BENCH_RECIPES,
  capacityFor,
  createBlueprint,
  lockedStockpileItem,
  recipeAccepting,
  recipeSatisfied,
  recipesFor,
  stepBlueprints,
  stepMachines,
} from '../../src/sim/machines'

const PLANK_RECIPE = recipeAccepting(BENCH_SAW_RECIPES, 'log')
const FLOUR_RECIPE = recipeAccepting(MILL_RECIPES, 'grain')
const BLOCK_RECIPE = recipeAccepting(STONE_CUTTER_RECIPES, 'stone')
const GEAR_RECIPE = recipeAccepting(GEAR_PRESS_RECIPES, 'block')
const CIRCUIT_RECIPE = recipeAccepting(CIRCUIT_BENCH_RECIPES, 'gear')
const CORE_RECIPE = recipeAccepting(CORE_FORGE_RECIPES, 'circuit')
const PICKAXE_RECIPE = recipeAccepting(TOOL_BENCH_RECIPES, 'plank')
if (
  PLANK_RECIPE === undefined ||
  FLOUR_RECIPE === undefined ||
  BLOCK_RECIPE === undefined ||
  GEAR_RECIPE === undefined ||
  CIRCUIT_RECIPE === undefined ||
  CORE_RECIPE === undefined ||
  PICKAXE_RECIPE === undefined
) {
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

  it('creates a gear press idle and with an empty store', () => {
    const state = createWorld(5, 5, 1)
    const gearPressId = addGearPress(state, 1, 1)

    const gearPress = getEntity(state, gearPressId)
    expect(gearPress?.type).toBe('gearPress')
    expect(gearPress?.storage).toEqual({})
    expect(gearPress?.craftingUntilTick).toBeNull()
  })

  it('creates a circuit bench idle and with an empty store', () => {
    const state = createWorld(5, 5, 1)
    const circuitBenchId = addCircuitBench(state, 1, 1)

    const circuitBench = getEntity(state, circuitBenchId)
    expect(circuitBench?.type).toBe('circuitBench')
    expect(circuitBench?.storage).toEqual({})
    expect(circuitBench?.craftingUntilTick).toBeNull()
  })

  it('creates a core forge idle and with an empty store', () => {
    const state = createWorld(5, 5, 1)
    const coreForgeId = addCoreForge(state, 1, 1)

    const coreForge = getEntity(state, coreForgeId)
    expect(coreForge?.type).toBe('coreForge')
    expect(coreForge?.storage).toEqual({})
    expect(coreForge?.craftingUntilTick).toBeNull()
  })

  it('creates a tool bench idle and with an empty store', () => {
    const state = createWorld(5, 5, 1)
    const toolBenchId = addToolBench(state, 1, 1)

    const toolBench = getEntity(state, toolBenchId)
    expect(toolBench?.type).toBe('toolBench')
    expect(toolBench?.storage).toEqual({})
    expect(toolBench?.craftingUntilTick).toBeNull()
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

  it('produces a gear from a pressing gear press once its recipe time elapses', () => {
    const state = createWorld(5, 5, 1)
    const gearPressId = addGearPress(state, 1, 1)
    const gearPress = getEntity(state, gearPressId)
    if (gearPress === undefined) {
      throw new Error('gear press missing')
    }
    gearPress.craftingStartedTick = state.tick
    gearPress.craftingUntilTick = state.tick + GEAR_RECIPE.ticks
    gearPress.craftingOutput = GEAR_RECIPE.output

    for (let i = 0; i < GEAR_RECIPE.ticks; i += 1) {
      state.tick += 1
      stepMachines(state)
    }

    expect(gearPress.craftingUntilTick).toBeNull()
    expect(gearPress.storage).toEqual({ gear: 1 })
  })

  it('produces a circuit from an assembling circuit bench once its recipe time elapses', () => {
    const state = createWorld(5, 5, 1)
    const circuitBenchId = addCircuitBench(state, 1, 1)
    const circuitBench = getEntity(state, circuitBenchId)
    if (circuitBench === undefined) {
      throw new Error('circuit bench missing')
    }
    circuitBench.craftingStartedTick = state.tick
    circuitBench.craftingUntilTick = state.tick + CIRCUIT_RECIPE.ticks
    circuitBench.craftingOutput = CIRCUIT_RECIPE.output

    for (let i = 0; i < CIRCUIT_RECIPE.ticks; i += 1) {
      state.tick += 1
      stepMachines(state)
    }

    expect(circuitBench.craftingUntilTick).toBeNull()
    expect(circuitBench.storage).toEqual({ circuit: 1 })
  })

  it('produces a core from a working core forge once its recipe time elapses', () => {
    const state = createWorld(5, 5, 1)
    const coreForgeId = addCoreForge(state, 1, 1)
    const coreForge = getEntity(state, coreForgeId)
    if (coreForge === undefined) {
      throw new Error('core forge missing')
    }
    coreForge.craftingStartedTick = state.tick
    coreForge.craftingUntilTick = state.tick + CORE_RECIPE.ticks
    coreForge.craftingOutput = CORE_RECIPE.output

    for (let i = 0; i < CORE_RECIPE.ticks; i += 1) {
      state.tick += 1
      stepMachines(state)
    }

    expect(coreForge.craftingUntilTick).toBeNull()
    expect(coreForge.storage).toEqual({ core: 1 })
  })

  it('produces a pickaxe from a working tool bench once its recipe time elapses', () => {
    const state = createWorld(5, 5, 1)
    const toolBenchId = addToolBench(state, 1, 1)
    const toolBench = getEntity(state, toolBenchId)
    if (toolBench === undefined) {
      throw new Error('tool bench missing')
    }
    toolBench.craftingStartedTick = state.tick
    toolBench.craftingUntilTick = state.tick + PICKAXE_RECIPE.ticks
    toolBench.craftingOutput = PICKAXE_RECIPE.output

    for (let i = 0; i < PICKAXE_RECIPE.ticks; i += 1) {
      state.tick += 1
      stepMachines(state)
    }

    expect(toolBench.craftingUntilTick).toBeNull()
    expect(toolBench.storage).toEqual({ pickaxe: 1 })
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

  it('returns the gear press recipe table for a gear press', () => {
    expect(recipesFor('gearPress')).toBe(GEAR_PRESS_RECIPES)
  })

  it('returns the circuit bench recipe table for a circuit bench', () => {
    expect(recipesFor('circuitBench')).toBe(CIRCUIT_BENCH_RECIPES)
  })

  it('returns the core forge recipe table for a core forge', () => {
    expect(recipesFor('coreForge')).toBe(CORE_FORGE_RECIPES)
  })

  it('returns the tool bench recipe table for a tool bench', () => {
    expect(recipesFor('toolBench')).toBe(TOOL_BENCH_RECIPES)
  })

  it('returns null for anything that is not a machine', () => {
    expect(recipesFor('stockpile')).toBeNull()
    expect(recipesFor('tree')).toBeNull()
  })
})

describe('recipeAccepting', () => {
  it('finds the recipe that consumes a given item', () => {
    expect(recipeAccepting(BENCH_SAW_RECIPES, 'log')).toBe(PLANK_RECIPE)
  })

  it('finds the same multi-input recipe regardless of which of its inputs is asked about', () => {
    expect(recipeAccepting(TOOL_BENCH_RECIPES, 'plank')).toBe(PICKAXE_RECIPE)
    expect(recipeAccepting(TOOL_BENCH_RECIPES, 'block')).toBe(PICKAXE_RECIPE)
  })

  it('is undefined for an item none of the recipes consume', () => {
    expect(recipeAccepting(BENCH_SAW_RECIPES, 'grain')).toBeUndefined()
  })
})

describe('recipeSatisfied', () => {
  it('is true for a single-input recipe once that one input is covered', () => {
    expect(recipeSatisfied(PLANK_RECIPE, { log: 1 })).toBe(true)
    expect(recipeSatisfied(PLANK_RECIPE, {})).toBe(false)
  })

  it('is false for a multi-input recipe until every input is covered', () => {
    expect(recipeSatisfied(PICKAXE_RECIPE, {})).toBe(false)
    expect(recipeSatisfied(PICKAXE_RECIPE, { plank: 1 })).toBe(false)
    expect(recipeSatisfied(PICKAXE_RECIPE, { block: 1 })).toBe(false)
    expect(recipeSatisfied(PICKAXE_RECIPE, { plank: 1, block: 1 })).toBe(true)
  })

  it('is true once storage meets or exceeds every input, not just equals it', () => {
    expect(recipeSatisfied(PICKAXE_RECIPE, { plank: 5, block: 3 })).toBe(true)
  })
})

describe('BENCH_SAW_RECIPES / STONE_CUTTER_RECIPES', () => {
  it('the bench saw no longer turns stone into blocks -- that moved to the stone cutter', () => {
    expect(recipeAccepting(BENCH_SAW_RECIPES, 'stone')).toBeUndefined()
    expect(recipeAccepting(STONE_CUTTER_RECIPES, 'stone')?.output).toBe('block')
  })

  it('the bench saw only ever produces plank -- gear/circuit/core/pickaxe each moved to their own machine', () => {
    expect(recipeAccepting(BENCH_SAW_RECIPES, 'block')).toBeUndefined()
    expect(recipeAccepting(BENCH_SAW_RECIPES, 'gear')).toBeUndefined()
    expect(recipeAccepting(BENCH_SAW_RECIPES, 'circuit')).toBeUndefined()
    expect(recipeAccepting(BENCH_SAW_RECIPES, 'plank')).toBeUndefined()
    expect(recipeAccepting(GEAR_PRESS_RECIPES, 'block')?.output).toBe('gear')
    expect(recipeAccepting(CIRCUIT_BENCH_RECIPES, 'gear')?.output).toBe('circuit')
    expect(recipeAccepting(CORE_FORGE_RECIPES, 'circuit')?.output).toBe('core')
    expect(recipeAccepting(TOOL_BENCH_RECIPES, 'plank')?.output).toBe('pickaxe')
  })

  it('the tool bench needs both a plank and a block for its pickaxe recipe', () => {
    const recipe = recipeAccepting(TOOL_BENCH_RECIPES, 'plank')
    expect(recipe?.inputs).toEqual({ plank: 1, block: 1 })
    expect(recipeAccepting(TOOL_BENCH_RECIPES, 'block')).toBe(recipe)
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
    expect(capacityFor('gearPress')).toBe(CONTAINER_CAPACITY)
    expect(capacityFor('circuitBench')).toBe(CONTAINER_CAPACITY)
    expect(capacityFor('coreForge')).toBe(CONTAINER_CAPACITY)
    expect(capacityFor('toolBench')).toBe(CONTAINER_CAPACITY)
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

  it('converts a fully-stocked blueprint into each of the four newer machine kinds', () => {
    for (const kind of ['gearPress', 'circuitBench', 'coreForge', 'toolBench'] as const) {
      const state = createWorld(5, 5, 1)
      const blueprintId = addEntity(state, createBlueprint(kind, { x: 2, y: 3 }))
      const blueprint = getEntity(state, blueprintId)
      if (blueprint === undefined) {
        throw new Error('blueprint missing')
      }
      blueprint.storage = { ...BUILDING_COSTS[kind] }

      stepBlueprints(state)

      const finished = getEntity(state, blueprintId)
      expect(finished?.type).toBe(kind)
      expect(finished?.blueprintOf).toBeNull()
      expect(finished?.storage).toEqual({})
    }
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
