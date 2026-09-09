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

export function createStockpile(pos: TileRef): EntityData {
  return { ...staticEntity('stockpile', pos), storage: {} }
}

export function createBenchSaw(pos: TileRef): EntityData {
  return { ...staticEntity('benchSaw', pos), storage: {} }
}

/** Finishes any bench saw whose recipe time has elapsed, moving its output into its store. */
export function stepMachines(state: SimState): void {
  const sorted = [...state.entities].sort((a, b) => a.id - b.id)
  for (const entity of sorted) {
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
