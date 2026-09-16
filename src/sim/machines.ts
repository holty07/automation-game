import { BOT_TIER_COSTS } from './botCosts'
import { createBotRuntime } from './botRuntime'
import type { EntityData } from './entities'
import { staticEntity } from './entities'
import { instantiateProgram } from './routines'
import type { BuildableType, EntityType, ItemKind, SimState, TileRef } from './types'

/** `inputs` names every item kind (and count) a recipe consumes — one for most recipes, but a
 * machine can require several different items at once, delivered in any order (see
 * TOOL_BENCH_RECIPES). A machine accumulates deliveries in its own `storage` (see actions.ts's
 * giveTo) until every input is covered, then consumes them all at once and starts the timer. */
export interface Recipe {
  inputs: Partial<Record<ItemKind, number>>
  output: ItemKind
  ticks: number
}

/** The bench saw turns logs into the planks the bot body (and several other machines) are built
 * from. Every other refining step of the resource chain — stone into blocks, grain into flour,
 * and each rung of the gear/circuit/core/pickaxe ladder — gets its own dedicated machine below,
 * rather than piling more recipes onto the saw. */
export const BENCH_SAW_RECIPES: Recipe[] = [{ inputs: { log: 1 }, output: 'plank', ticks: 80 }]

/** The stone cutter turns raw stone into blocks — split out of the bench saw so a dedicated
 * building handles that step of the resource chain. */
export const STONE_CUTTER_RECIPES: Recipe[] = [{ inputs: { stone: 1 }, output: 'block', ticks: 80 }]

/** The mill turns harvested grain into the flour a Mk1 bot needs. */
export const MILL_RECIPES: Recipe[] = [{ inputs: { grain: 1 }, output: 'flour', ticks: 60 }]

/** The gear press turns a cut block into a gear, the material a Mk2 upgrade needs. */
export const GEAR_PRESS_RECIPES: Recipe[] = [{ inputs: { block: 1 }, output: 'gear', ticks: 100 }]

/** The circuit bench turns a gear into a circuit, the material a Mk3 upgrade needs. */
export const CIRCUIT_BENCH_RECIPES: Recipe[] = [{ inputs: { gear: 1 }, output: 'circuit', ticks: 120 }]

/** The core forge turns a circuit into a core, the material a Mk4 upgrade needs. */
export const CORE_FORGE_RECIPES: Recipe[] = [{ inputs: { circuit: 1 }, output: 'core', ticks: 150 }]

/** The tool bench turns a plank and a block into a pickaxe, the tool a stone deposit needs to be
 * mined at all — the plank forms its handle, the block its head. */
export const TOOL_BENCH_RECIPES: Recipe[] = [{ inputs: { plank: 1, block: 1 }, output: 'pickaxe', ticks: 60 }]

/** The recipes a machine of `type` crafts from, or null if `type` isn't a machine. */
export function recipesFor(type: EntityType): Recipe[] | null {
  switch (type) {
    case 'benchSaw':
      return BENCH_SAW_RECIPES
    case 'stoneCutter':
      return STONE_CUTTER_RECIPES
    case 'mill':
      return MILL_RECIPES
    case 'gearPress':
      return GEAR_PRESS_RECIPES
    case 'circuitBench':
      return CIRCUIT_BENCH_RECIPES
    case 'coreForge':
      return CORE_FORGE_RECIPES
    case 'toolBench':
      return TOOL_BENCH_RECIPES
    default:
      return null
  }
}

/** The recipe among `recipes` that consumes `item` at all, or undefined if none of them do —
 * every machine currently offers only one recipe, so there's no ambiguity between several
 * matches, but this stays generic over the list in case a machine ever offers more than one. */
export function recipeAccepting(recipes: Recipe[], item: ItemKind): Recipe | undefined {
  return recipes.find((recipe) => item in recipe.inputs)
}

/** Whether `storage` currently covers every input `recipe` needs, so a machine's craft can begin. */
export function recipeSatisfied(recipe: Recipe, storage: Partial<Record<ItemKind, number>>): boolean {
  return (Object.entries(recipe.inputs) as [ItemKind, number][]).every(([item, count]) => (storage[item] ?? 0) >= count)
}

/** Flat cap on total items (summed across kinds) a machine or blueprint can hold — no economy
 * tuning exists yet, this just gives the CONTAINER_FULL condition something real to check.
 * Stockpiles use the larger STOCKPILE_CAPACITY instead — see capacityFor. */
export const CONTAINER_CAPACITY = 50

/** A stockpile exists specifically to hold a lot of one resource, so it gets a much higher cap
 * than a machine's small in-progress buffer. Still finite — a stockpile can't just grow forever. */
export const STOCKPILE_CAPACITY = 100

/** The storage cap for a given storage-bearing entity type — a stockpile gets STOCKPILE_CAPACITY,
 * everything else (machines, blueprints) gets the smaller CONTAINER_CAPACITY. */
export function capacityFor(type: EntityType): number {
  return type === 'stockpile' ? STOCKPILE_CAPACITY : CONTAINER_CAPACITY
}

/** Materials a blueprint needs delivered before stepBlueprints completes it into the finished
 * building (or, for `bot`, a freshly assigned Mk1 bot) — nothing here is free to place, only free
 * to plan. stockpile, benchSaw and stoneCutter are costed in raw log/stone (choppable/mineable
 * with no machine at all), not plank/block, since those are only ever produced BY a bench saw or
 * stone cutter — costing either one's own blueprint in them would make it impossible to ever build
 * the first one. Everything downstream of those two can safely cost their output instead, since by
 * the time a player wants it the upstream machine already exists: mill and gearPress cost
 * plank/block; circuitBench costs plank/gear (once a gearPress is already supplying gears);
 * coreForge costs block/circuit (once a circuitBench is already supplying circuits); toolBench
 * costs plank alone, since a pickaxe is only ever needed later, to mine a stone deposit. bot reuses
 * BOT_TIER_COSTS.mk1 so the two costs never drift apart — upgrading a tier and building the bot in
 * the first place stay quoted the same way. */
export const BUILDING_COSTS: Record<BuildableType, Partial<Record<ItemKind, number>>> = {
  stockpile: { log: 2 },
  benchSaw: { log: 2, stone: 2 },
  stoneCutter: { log: 2, stone: 2 },
  mill: { plank: 4, block: 1 },
  gearPress: { plank: 2, block: 2 },
  circuitBench: { plank: 2, gear: 2 },
  coreForge: { block: 2, circuit: 1 },
  toolBench: { plank: 3 },
  bot: BOT_TIER_COSTS.mk1,
}

export function totalStored(storage: Partial<Record<ItemKind, number>>): number {
  return Object.values(storage).reduce<number>((sum, count) => sum + (count ?? 0), 0)
}

/** The one item kind a stockpile currently holds, or null once it's empty — a stockpile locks to
 * whatever kind is first delivered (see actions.ts's giveTo) and stays locked until emptied, so
 * withdrawing from it (a click, or a bot's TAKE_FROM) is never a guess between several kinds. */
export function lockedStockpileItem(storage: Partial<Record<ItemKind, number>>): ItemKind | null {
  const entry = (Object.entries(storage) as [ItemKind, number][]).find(([, count]) => count > 0)
  return entry === undefined ? null : entry[0]
}

export function createStockpile(pos: TileRef): EntityData {
  return { ...staticEntity('stockpile', pos), storage: {} }
}

export function createBenchSaw(pos: TileRef): EntityData {
  return { ...staticEntity('benchSaw', pos), storage: {} }
}

export function createStoneCutter(pos: TileRef): EntityData {
  return { ...staticEntity('stoneCutter', pos), storage: {} }
}

export function createMill(pos: TileRef): EntityData {
  return { ...staticEntity('mill', pos), storage: {} }
}

export function createGearPress(pos: TileRef): EntityData {
  return { ...staticEntity('gearPress', pos), storage: {} }
}

export function createCircuitBench(pos: TileRef): EntityData {
  return { ...staticEntity('circuitBench', pos), storage: {} }
}

export function createCoreForge(pos: TileRef): EntityData {
  return { ...staticEntity('coreForge', pos), storage: {} }
}

export function createToolBench(pos: TileRef): EntityData {
  return { ...staticEntity('toolBench', pos), storage: {} }
}

/** A planned building or bot, placed by BUILD: occupies its tile like the finished thing would,
 * but starts empty and only becomes `kind` once stepBlueprints sees its storage cover
 * BUILDING_COSTS. */
export function createBlueprint(kind: BuildableType, pos: TileRef): EntityData {
  return { ...staticEntity('blueprint', pos), storage: {}, blueprintOf: kind }
}

/** Finishes any machine whose recipe time has elapsed, moving its recorded output into its store.
 * Generic over every machine type — the specific recipe was already resolved and stashed in
 * craftingOutput when the craft began (see actions.ts's giveTo), so this needs no recipe lookup of
 * its own. Restricted to actual machines (recipesFor(type) !== null) — several other entity types
 * (a growing seedling/young tree, a mid-chop tree/rock) reuse the same craftingUntilTick field for
 * their own unrelated timers, and would have theirs silently cleared here (with no storage to
 * deposit into) if this ever ran unfiltered; those systems currently avoid the collision by never
 * setting craftingOutput, but filtering by type here too is a cheap, explicit belt-and-braces,
 * matching how stepCrops/stepTreeGrowth already restrict themselves to their own entity type.
 * `state.entities` is always already in ascending id order, so no sort is needed here — this runs
 * every tick, for every entity. */
export function stepMachines(state: SimState): void {
  for (const entity of state.entities) {
    if (recipesFor(entity.type) === null) {
      continue
    }
    if (entity.craftingUntilTick === null || entity.craftingOutput === null) {
      continue
    }
    if (state.tick < entity.craftingUntilTick) {
      continue
    }
    const output = entity.craftingOutput
    entity.craftingUntilTick = null
    entity.craftingOutput = null
    entity.craftingStartedTick = null
    if (entity.storage !== null) {
      entity.storage[output] = (entity.storage[output] ?? 0) + 1
    }
  }
}

/** Completes any blueprint whose delivered storage now covers its full BUILDING_COSTS, turning it
 * into the finished building (or bot) in place — same id, same position, empty storage. A `bot`
 * blueprint additionally gets a fresh, empty Mk1 program and runtime, exactly like the free
 * starter bot (see main.ts) — the player teaches it a job afterwards via the script editor's own
 * Record button. `state.entities` is always already in ascending id order, so no sort is needed
 * here. */
export function stepBlueprints(state: SimState): void {
  for (const entity of state.entities) {
    const kind = entity.blueprintOf
    const storage = entity.storage
    if (entity.type !== 'blueprint' || kind === null || storage === null) {
      continue
    }
    const cost = BUILDING_COSTS[kind]
    const delivered = (Object.entries(cost) as [ItemKind, number][]).every(([item, count]) => (storage[item] ?? 0) >= count)
    if (!delivered) {
      continue
    }
    if (kind === 'bot') {
      const programId = `bot-${entity.id}`
      const program = instantiateProgram(programId, `Bot ${entity.id}`, [])
      state.programs[programId] = program
      state.botRuntimes[entity.id] = createBotRuntime(programId, program)
    }
    entity.type = kind
    entity.blueprintOf = null
    entity.storage = {}
  }
}
