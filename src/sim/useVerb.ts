import { createGroundItem, getActionCost, RESOURCE_YIELD } from './entities'
import { createSeedling, createTilledSoil, WHEAT_GROW_TICKS } from './farming'
import { SAPLING_DROP_CHANCE } from './planting'
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

/** Chop/mine: the target is removed and its yield is dropped as a ground item at the same tile.
 * Chopping a tree also has a chance of dropping a sapling alongside the log — see planting.ts. */
function useResource(state: SimState, actor: Entity, target: Entity, resourceType: 'tree' | 'rock'): UseResult {
  const cost = getActionCost('USE', resourceType)
  const yieldKind = RESOURCE_YIELD[resourceType]
  const spawnPos = target.pos
  removeEntity(state, target.id)
  const producedEntityId = spawnGroundItem(state, yieldKind, spawnPos)
  if (resourceType === 'tree' && state.rng.next() < SAPLING_DROP_CHANCE) {
    spawnGroundItem(state, 'sapling', spawnPos)
  }
  actor.busyUntilTick = state.tick + cost
  return { ok: true, producedEntityId }
}

/** Mine a renewable stone deposit: unlike a rock, the deposit is never removed — only mineable
 * while the actor holds a pickaxe, and immediately mineable again afterwards. The stone drops at
 * the actor's own feet rather than the deposit's tile: the deposit blocks movement, so a tile
 * shared with it would leave the stone unreachable (nothing could ever stand there to pick it up). */
function useStoneDeposit(state: SimState, actor: Entity): UseResult {
  if (actor.held !== 'pickaxe') {
    return fail('needs a pickaxe to mine this')
  }
  const cost = getActionCost('USE', 'stoneDeposit')
  const producedEntityId = spawnGroundItem(state, 'stone', actor.pos)
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

/** Harvest: yields grain and leaves tilled soil behind, ready to sow again without re-tilling. The
 * grain drops at the actor's own feet rather than the wheat's tile — same reasoning as
 * useStoneDeposit: a fixture's own tile never doubles as a loose-item drop spot, so the two are
 * always visually and click-wise distinct instead of one potentially drawing over the other. */
function useWheat(state: SimState, actor: Entity, target: Entity): UseResult {
  const cost = getActionCost('USE', 'wheat')
  const spawnPos = target.pos
  removeEntity(state, target.id)
  const producedEntityId = spawnGroundItem(state, 'grain', actor.pos)
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
    case 'stoneDeposit':
      return useStoneDeposit(state, actor)
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
