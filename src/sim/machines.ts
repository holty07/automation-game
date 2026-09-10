import type { EntityData } from './entities'
import { staticEntity } from './entities'
import type { ItemKind, SimState, TileRef } from './types'

export interface Recipe {
  input: ItemKind
  output: ItemKind
  ticks: number
}

export const BENCH_SAW_RECIPE: Recipe = {
  input: 'log',
  output: 'plank',
  ticks: 80,
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

/** Finishes any bench saw whose recipe time has elapsed, moving its output into its store.
 * `state.entities` is always already in ascending id order, so no sort is needed here — this
 * runs every tick, for every entity. */
export function stepMachines(state: SimState): void {
  for (const entity of state.entities) {
    if (entity.type !== 'benchSaw' || entity.craftingUntilTick === null) {
      continue
    }
    if (state.tick < entity.craftingUntilTick) {
      continue
    }
    entity.craftingUntilTick = null
    if (entity.storage !== null) {
      entity.storage[BENCH_SAW_RECIPE.output] = (entity.storage[BENCH_SAW_RECIPE.output] ?? 0) + 1
    }
  }
}
