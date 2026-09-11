import type { EntityData } from './entities'
import { staticEntity } from './entities'
import type { BuildableType, EntityType, ItemKind, SimState, TileRef } from './types'

export interface Recipe {
  input: ItemKind
  output: ItemKind
  ticks: number
}

function recipeTable(recipes: Recipe[]): Partial<Record<ItemKind, Recipe>> {
  const table: Partial<Record<ItemKind, Recipe>> = {}
  for (const recipe of recipes) {
    table[recipe.input] = recipe
  }
  return table
}

/** The bench saw refines raw resources into successively finer materials: wood into planks (the
 * bot body), stone into blocks and onward into the gears/circuits/cores the Mk2-4 upgrade path
 * needs. Each recipe is keyed by its input, so giving the bench saw an item looks up the right one. */
export const BENCH_SAW_RECIPES = recipeTable([
  { input: 'log', output: 'plank', ticks: 80 },
  { input: 'stone', output: 'block', ticks: 80 },
  { input: 'block', output: 'gear', ticks: 100 },
  { input: 'gear', output: 'circuit', ticks: 120 },
  { input: 'circuit', output: 'core', ticks: 150 },
])

/** The mill turns harvested grain into the flour a Mk1 bot needs. */
export const MILL_RECIPES = recipeTable([{ input: 'grain', output: 'flour', ticks: 60 }])

/** The recipe table a machine of `type` crafts from, or null if `type` isn't a machine. */
export function recipesFor(type: EntityType): Partial<Record<ItemKind, Recipe>> | null {
  switch (type) {
    case 'benchSaw':
      return BENCH_SAW_RECIPES
    case 'mill':
      return MILL_RECIPES
    default:
      return null
  }
}

/** Flat cap on total items (summed across kinds) a container can hold — no economy tuning exists
 * yet, this just gives the CONTAINER_FULL condition something real to check. */
export const CONTAINER_CAPACITY = 50

/** Materials a blueprint needs delivered before stepBlueprints completes it into the finished
 * building — buildings are no longer free to place, only free to plan. stockpile and benchSaw are
 * costed in raw log/stone (choppable/mineable with no machine at all), not plank/block, since
 * those are only ever produced BY a bench saw — costing the bench saw's own blueprint in them
 * would make it impossible to ever build the first one. mill can safely cost plank/block: by the
 * time a player wants a mill, a bench saw (and so a plank/block supply) already exists. */
export const BUILDING_COSTS: Record<BuildableType, Partial<Record<ItemKind, number>>> = {
  stockpile: { log: 2 },
  benchSaw: { log: 2, stone: 2 },
  mill: { plank: 4, block: 1 },
}

export function totalStored(storage: Partial<Record<ItemKind, number>>): number {
  return Object.values(storage).reduce<number>((sum, count) => sum + (count ?? 0), 0)
}

export function createStockpile(pos: TileRef): EntityData {
  return { ...staticEntity('stockpile', pos), storage: {} }
}

export function createBenchSaw(pos: TileRef): EntityData {
  return { ...staticEntity('benchSaw', pos), storage: {} }
}

export function createMill(pos: TileRef): EntityData {
  return { ...staticEntity('mill', pos), storage: {} }
}

/** A planned building, placed by BUILD: occupies its tile like the finished building would, but
 * starts empty and only becomes `kind` once stepBlueprints sees its storage cover BUILDING_COSTS. */
export function createBlueprint(kind: BuildableType, pos: TileRef): EntityData {
  return { ...staticEntity('blueprint', pos), storage: {}, blueprintOf: kind }
}

/** Finishes any machine whose recipe time has elapsed, moving its recorded output into its store.
 * Generic over every machine type — the specific recipe was already resolved and stashed in
 * craftingOutput when the craft began (see actions.ts's giveTo), so this needs no recipe lookup of
 * its own. `state.entities` is always already in ascending id order, so no sort is needed here —
 * this runs every tick, for every entity. */
export function stepMachines(state: SimState): void {
  for (const entity of state.entities) {
    if (entity.craftingUntilTick === null || entity.craftingOutput === null) {
      continue
    }
    if (state.tick < entity.craftingUntilTick) {
      continue
    }
    const output = entity.craftingOutput
    entity.craftingUntilTick = null
    entity.craftingOutput = null
    if (entity.storage !== null) {
      entity.storage[output] = (entity.storage[output] ?? 0) + 1
    }
  }
}

/** Completes any blueprint whose delivered storage now covers its full BUILDING_COSTS, turning it
 * into the finished building in place — same id, same position, empty storage. `state.entities` is
 * always already in ascending id order, so no sort is needed here. */
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
    entity.type = kind
    entity.blueprintOf = null
    entity.storage = {}
  }
}
