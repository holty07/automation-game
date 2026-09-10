import type { EntityData } from './entities'
import { staticEntity } from './entities'
import type { SimState, TileRef } from './types'
import { addEntity, removeEntity } from './world'

/** Ticks a sown seedling takes to become harvestable wheat. */
export const WHEAT_GROW_TICKS = 300

/** An untilled patch of ground — scattered at world generation like trees and rocks. USE tills it. */
export function createSoil(pos: TileRef): EntityData {
  return staticEntity('soil', pos)
}

/** Tilled, sowable ground. USE sows it, starting a seedling's growth timer. */
export function createTilledSoil(pos: TileRef): EntityData {
  return staticEntity('tilledSoil', pos)
}

/** A growing crop. Turns into wheat on its own once craftingUntilTick elapses — see stepCrops. */
export function createSeedling(pos: TileRef): EntityData {
  return staticEntity('seedling', pos)
}

/** Ready to harvest. USE harvests it: yields grain and leaves tilled soil behind, ready to re-sow. */
export function createWheat(pos: TileRef): EntityData {
  return staticEntity('wheat', pos)
}

/** Matures any seedling whose growth timer has elapsed into wheat, in place. Distinct from
 * stepMachines: a seedling has no storage output to deposit, it is replaced by a new entity
 * entirely, so it never sets `craftingOutput` and stepMachines skips it. */
export function stepCrops(state: SimState): void {
  for (const entity of state.entities) {
    if (entity.type !== 'seedling' || entity.craftingUntilTick === null) {
      continue
    }
    if (state.tick < entity.craftingUntilTick) {
      continue
    }
    const pos = entity.pos
    removeEntity(state, entity.id)
    addEntity(state, createWheat(pos))
  }
}
