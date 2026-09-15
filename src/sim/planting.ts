import type { EntityData } from './entities'
import { createTree, getActionCost, staticEntity } from './entities'
import { isAdjacent } from './pathfind'
import type { Entity, EntityId, SimState, TileRef } from './types'
import { addEntity, entitiesAt, getEntity, inBounds, removeEntity } from './world'

/** Ticks a planted sapling takes to grow into a full tree. */
export const TREE_GROW_TICKS = 500

/** Chance a chopped tree also drops a sapling alongside its log — see useVerb.ts's useResource.
 * The renewable half of the chop loop: without this, felled trees would never come back. */
export const SAPLING_DROP_CHANCE = 0.35

interface PlantResult {
  ok: boolean
  reason?: string
  producedEntityId?: EntityId
}

function fail(reason: string): PlantResult {
  return { ok: false, reason }
}

/** A planted sapling, growing toward a full tree — see stepTreeGrowth. Distinct from the
 * 'sapling' item it was planted from: that's a loose, pickup-able ground item, this is rooted. */
export function createYoungTree(pos: TileRef): EntityData {
  return staticEntity('youngTree', pos)
}

/** Matures any young tree whose growth timer has elapsed into a full tree, in place — mirrors
 * farming.ts's stepCrops. */
export function stepTreeGrowth(state: SimState): void {
  for (const entity of state.entities) {
    if (entity.type !== 'youngTree' || entity.craftingUntilTick === null) {
      continue
    }
    if (state.tick < entity.craftingUntilTick) {
      continue
    }
    const pos = entity.pos
    removeEntity(state, entity.id)
    addEntity(state, createTree(pos))
  }
}

/** PLANT: consumes a held sapling to start a young tree growing on an adjacent, empty tile — the
 * same tile validation as actions.ts's build(), for a resource instead of a building. */
export function plant(state: SimState, actor: Entity, target: TileRef): PlantResult {
  if (actor.held !== 'sapling') {
    return fail('not holding a sapling')
  }
  if (!inBounds(state, target)) {
    return fail('target is out of bounds')
  }
  if (!isAdjacent(actor.pos, target)) {
    return fail('target is out of reach')
  }
  if (entitiesAt(state, target.x, target.y).length > 0) {
    return fail('target is occupied')
  }

  const cost = getActionCost('PLANT', 'sapling')
  const producedEntityId = addEntity(state, createYoungTree(target))
  const youngTree = getEntity(state, producedEntityId)
  if (youngTree !== undefined) {
    youngTree.craftingStartedTick = state.tick
    youngTree.craftingUntilTick = state.tick + TREE_GROW_TICKS
  }
  actor.held = null
  actor.busyUntilTick = state.tick + cost
  return { ok: true, producedEntityId }
}
