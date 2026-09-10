import type { EntityData } from './entities'
import { staticEntity } from './entities'
import type { EntityType, ItemKind, SimState, TileRef } from './types'

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
