import { createGroundItem, getActionCost, RESOURCE_YIELD } from './entities'
import { createSeedling, createTilledSoil, WHEAT_GROW_TICKS } from './farming'
import { isAdjacent } from './pathfind'
import type { Entity, EntityId, ItemKind, SimState, TileRef } from './types'
import { addEntity, getEntity, removeEntity } from './world'

/** Everything the USE verb can do: chop/mine (tree, rock) and the farming chain (soil, tilled
 * soil, wheat). Split out of actions.ts to keep that file focused on the other verbs; executeAction
 * is still the only caller, so it remains the single entry point every mutation flows through. */

interface UseResult {
  ok: boolean
  reason?: string
  producedEntityId?: EntityId
}

function fail(reason: string): UseResult {
  return { ok: false, reason }
}

function spawnGroundItem(state: SimState, kind: ItemKind, pos: TileRef): EntityId {
  return addEntity(state, createGroundItem(kind, pos))
}

/** Chop/mine: the target is removed and its yield is dropped as a ground item at the same tile. */
function useResource(state: SimState, actor: Entity, target: Entity, resourceType: 'tree' | 'rock'): UseResult {
  const cost = getActionCost('USE', resourceType)
  const yieldKind = RESOURCE_YIELD[resourceType]
  const spawnPos = target.pos
  removeEntity(state, target.id)
  const producedEntityId = spawnGroundItem(state, yieldKind, spawnPos)
  actor.busyUntilTick = state.tick + cost
  return { ok: true, producedEntityId }
}

/** Till: turns a patch of soil into tilled, sowable ground. */
function useSoil(state: SimState, actor: Entity, target: Entity): UseResult {
  const cost = getActionCost('USE', 'soil')
  const spawnPos = target.pos
  removeEntity(state, target.id)
  const producedEntityId = addEntity(state, createTilledSoil(spawnPos))
  actor.busyUntilTick = state.tick + cost
  return { ok: true, producedEntityId }
}

/** Sow: plants a seedling in tilled soil, which matures into wheat on its own (see stepCrops). */
function useTilledSoil(state: SimState, actor: Entity, target: Entity): UseResult {
  const cost = getActionCost('USE', 'tilledSoil')
  const spawnPos = target.pos
  removeEntity(state, target.id)
  const producedEntityId = addEntity(state, createSeedling(spawnPos))
  const seedling = getEntity(state, producedEntityId)
  if (seedling !== undefined) {
    seedling.craftingUntilTick = state.tick + WHEAT_GROW_TICKS
  }
  actor.busyUntilTick = state.tick + cost
  return { ok: true, producedEntityId }
}

/** Harvest: yields grain and leaves tilled soil behind, ready to sow again without re-tilling. */
function useWheat(state: SimState, actor: Entity, target: Entity): UseResult {
  const cost = getActionCost('USE', 'wheat')
  const spawnPos = target.pos
  removeEntity(state, target.id)
  const producedEntityId = spawnGroundItem(state, 'grain', spawnPos)
  addEntity(state, createTilledSoil(spawnPos))
  actor.busyUntilTick = state.tick + cost
  return { ok: true, producedEntityId }
}

export function use(state: SimState, actor: Entity, targetId: EntityId): UseResult {
  const target = getEntity(state, targetId)
  if (target === undefined) {
    return fail('nothing to use there')
  }
  if (!isAdjacent(actor.pos, target.pos)) {
    return fail('target is out of reach')
  }

  switch (target.type) {
    case 'tree':
    case 'rock':
      return useResource(state, actor, target, target.type)
    case 'soil':
      return useSoil(state, actor, target)
    case 'tilledSoil':
      return useTilledSoil(state, actor, target)
    case 'wheat':
      return useWheat(state, actor, target)
    default:
      return fail('nothing to use there')
  }
}
