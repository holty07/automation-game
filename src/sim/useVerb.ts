import { createGroundItem, getActionCost, RESOURCE_YIELD } from './entities'
import { createSeedling, createTilledSoil, WHEAT_GROW_TICKS } from './farming'
import { SAPLING_DROP_CHANCE } from './planting'
import { isAdjacent } from './pathfind'
import type { Entity, EntityId, ItemKind, SimState, TileRef } from './types'
import { addEntity, getEntity, removeEntity } from './world'

/** Everything the USE verb can do: chop/mine (tree, rock — deferred, see useResource/stepHarvests)
 * and the farming chain (soil, tilled soil, wheat — all still instant). Split out of actions.ts to
 * keep that file focused on the other verbs; executeAction is still the only caller, so it remains
 * the single entry point every mutation flows through (stepHarvests is the one exception here, the
 * same way stepMachines/stepCrops/stepTreeGrowth already are — a tick-driven completion, not a
 * player/bot action). */

interface UseResult {
  ok: boolean
  reason?: string
  producedEntityId?: EntityId
  producedTile?: TileRef
}

function fail(reason: string): UseResult {
  return { ok: false, reason }
}

function spawnGroundItem(state: SimState, kind: ItemKind, pos: TileRef): EntityId {
  return addEntity(state, createGroundItem(kind, pos))
}

/**
 * Chop/mine: starts the chop/mine in place rather than resolving it instantly — the target stays
 * put, marked mid-harvest via `craftingUntilTick` (the same field benchSaw/mill crafting and
 * seedling/young-tree growth already use for "this entity has a timed thing happening to it"; see
 * stepHarvests below for why it's safe to share). Nothing is produced yet, so there's no
 * `producedEntityId` to report — only `producedTile`, the tile the yield will appear on once
 * stepHarvests completes it, for a recorded chain's next step (typically PICK_UP lastResult) to
 * resolve against then. Only `craftingUntilTick` is set, never `craftingOutput` — the yield kind is
 * always derivable from the entity's own (still 'tree'/'rock') type, and leaving `craftingOutput`
 * null is what keeps stepMachines from ever touching a resource entity (see machines.ts). */
function useResource(state: SimState, actor: Entity, target: Entity, resourceType: 'tree' | 'rock'): UseResult {
  if (target.craftingUntilTick !== null) {
    return fail('already being harvested')
  }
  const cost = getActionCost('USE', resourceType)
  target.craftingStartedTick = state.tick
  target.craftingUntilTick = state.tick + cost
  actor.busyUntilTick = state.tick + cost
  return { ok: true, producedTile: { ...target.pos } }
}

/** Finishes any tree/rock whose chop/mine timer has elapsed: removes it and drops its yield as a
 * ground item on its own tile (a tree also has a chance of a sapling alongside the log — see
 * planting.ts). Mirrors farming.ts's stepCrops/planting.ts's stepTreeGrowth: a resource being
 * harvested has no storage to deposit into, so it's replaced by a new entity entirely instead of
 * going through stepMachines. Wired into tick.ts before stepBots, so a bot's next queued
 * instruction (typically PICK_UP lastResult) sees the yield already exist. */
export function stepHarvests(state: SimState): void {
  for (const entity of state.entities) {
    if (entity.type !== 'tree' && entity.type !== 'rock') {
      continue
    }
    if (entity.craftingUntilTick === null || state.tick < entity.craftingUntilTick) {
      continue
    }
    const resourceType = entity.type
    const pos = entity.pos
    removeEntity(state, entity.id)
    spawnGroundItem(state, RESOURCE_YIELD[resourceType], pos)
    if (resourceType === 'tree' && state.rng.next() < SAPLING_DROP_CHANCE) {
      spawnGroundItem(state, 'sapling', pos)
    }
  }
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
    seedling.craftingStartedTick = state.tick
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
