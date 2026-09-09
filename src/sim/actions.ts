import { createGroundItem, getActionCost, isItemKind, RESOURCE_YIELD } from './entities'
import { BENCH_SAW_RECIPE, createBenchSaw, createStockpile } from './machines'
import type { Entity, EntityId, ItemKind, SimState, TileRef } from './types'
import { addEntity, entitiesAt, getEntity, inBounds, isWalkable, removeEntity } from './world'
import { findPath, isAdjacent } from './pathfind'

/** Buildings the player can place on an empty tile. */
export type BuildableType = 'stockpile' | 'benchSaw'

export type ActionRequest =
  | { op: 'MOVE_TO'; target: TileRef }
  | { op: 'PICK_UP'; target: EntityId }
  | { op: 'DROP'; target: TileRef }
  | { op: 'USE'; target: EntityId }
  | { op: 'GIVE_TO'; target: EntityId }
  | { op: 'TAKE_FROM'; target: EntityId; item: ItemKind }
  | { op: 'BUILD'; kind: BuildableType; target: TileRef }

export interface ActionResult {
  ok: boolean
  reason?: string
  producedEntityId?: EntityId
}

function fail(reason: string): ActionResult {
  return { ok: false, reason }
}

function isBusy(state: SimState, actor: Entity): boolean {
  return actor.moveTarget !== null || actor.path.length > 0 || state.tick < actor.busyUntilTick
}

function beginMove(state: SimState, actor: Entity, target: TileRef): ActionResult {
  if (!inBounds(state, target)) {
    return fail('target is out of bounds')
  }
  if (!isWalkable(state, target)) {
    return fail('target is blocked')
  }
  const path = findPath(state, actor.pos, target)
  if (path === null) {
    return fail('no path to target')
  }
  if (path.length === 0) {
    return { ok: true }
  }
  const [next, ...rest] = path
  actor.moveTarget = next ?? null
  actor.path = rest
  return { ok: true }
}

function pickUp(state: SimState, actor: Entity, targetId: EntityId): ActionResult {
  const target = getEntity(state, targetId)
  if (target === undefined || !isItemKind(target.type)) {
    return fail('nothing to pick up there')
  }
  if (actor.held !== null) {
    return fail('hands are full')
  }
  if (target.pos.x !== actor.pos.x || target.pos.y !== actor.pos.y) {
    return fail('target is out of reach')
  }

  const cost = getActionCost('PICK_UP', target.type)
  removeEntity(state, target.id)
  actor.held = target.type
  actor.busyUntilTick = state.tick + cost
  return { ok: true }
}

function spawnGroundItem(state: SimState, kind: ItemKind, pos: TileRef): EntityId {
  return addEntity(state, createGroundItem(kind, pos))
}

function drop(state: SimState, actor: Entity, target: TileRef): ActionResult {
  if (actor.held === null) {
    return fail('not holding anything')
  }
  if (target.x !== actor.pos.x || target.y !== actor.pos.y) {
    return fail('can only drop at your own feet')
  }

  const heldKind = actor.held
  const cost = getActionCost('DROP', heldKind)
  const producedEntityId = spawnGroundItem(state, heldKind, target)
  actor.held = null
  actor.busyUntilTick = state.tick + cost
  return { ok: true, producedEntityId }
}

function use(state: SimState, actor: Entity, targetId: EntityId): ActionResult {
  const target = getEntity(state, targetId)
  if (target === undefined || (target.type !== 'tree' && target.type !== 'rock')) {
    return fail('nothing to use there')
  }
  if (!isAdjacent(actor.pos, target.pos)) {
    return fail('target is out of reach')
  }

  const cost = getActionCost('USE', target.type)
  const yieldKind = RESOURCE_YIELD[target.type]
  const spawnPos = target.pos
  removeEntity(state, target.id)
  const producedEntityId = spawnGroundItem(state, yieldKind, spawnPos)
  actor.busyUntilTick = state.tick + cost
  return { ok: true, producedEntityId }
}

function giveTo(state: SimState, actor: Entity, targetId: EntityId): ActionResult {
  const target = getEntity(state, targetId)
  if (target === undefined || target.storage === null) {
    return fail('nothing to give to there')
  }
  if (actor.held === null) {
    return fail('not holding anything')
  }
  if (!isAdjacent(actor.pos, target.pos)) {
    return fail('target is out of reach')
  }

  const heldKind = actor.held

  if (target.type === 'benchSaw') {
    if (heldKind !== BENCH_SAW_RECIPE.input) {
      return fail('the bench saw cannot use that')
    }
    if (target.craftingUntilTick !== null) {
      return fail('the bench saw is busy')
    }
    const cost = getActionCost('GIVE_TO', heldKind)
    actor.held = null
    actor.busyUntilTick = state.tick + cost
    target.craftingUntilTick = state.tick + BENCH_SAW_RECIPE.ticks
    return { ok: true }
  }

  const cost = getActionCost('GIVE_TO', heldKind)
  target.storage[heldKind] = (target.storage[heldKind] ?? 0) + 1
  actor.held = null
  actor.busyUntilTick = state.tick + cost
  return { ok: true }
}

function takeFrom(state: SimState, actor: Entity, targetId: EntityId, item: ItemKind): ActionResult {
  const target = getEntity(state, targetId)
  if (target === undefined || target.storage === null) {
    return fail('nothing to take from there')
  }
  if (actor.held !== null) {
    return fail('hands are full')
  }
  if (!isAdjacent(actor.pos, target.pos)) {
    return fail('target is out of reach')
  }
  const available = target.storage[item] ?? 0
  if (available <= 0) {
    return fail('nothing of that kind to take')
  }

  const cost = getActionCost('TAKE_FROM', item)
  target.storage[item] = available - 1
  actor.held = item
  actor.busyUntilTick = state.tick + cost
  return { ok: true }
}

function build(state: SimState, actor: Entity, kind: BuildableType, target: TileRef): ActionResult {
  if (!inBounds(state, target)) {
    return fail('target is out of bounds')
  }
  if (!isAdjacent(actor.pos, target)) {
    return fail('target is out of reach')
  }
  if (entitiesAt(state, target.x, target.y).length > 0) {
    return fail('target is occupied')
  }

  const cost = getActionCost('BUILD', kind)
  const entityData = kind === 'stockpile' ? createStockpile(target) : createBenchSaw(target)
  const producedEntityId = addEntity(state, entityData)
  actor.busyUntilTick = state.tick + cost
  return { ok: true, producedEntityId }
}

/** The only function that mutates the world. Every action a player or bot takes flows through here. */
export function executeAction(state: SimState, actorId: EntityId, request: ActionRequest): ActionResult {
  const actor = getEntity(state, actorId)
  if (actor === undefined) {
    return fail('unknown actor')
  }
  if (isBusy(state, actor)) {
    return fail('actor is busy')
  }

  switch (request.op) {
    case 'MOVE_TO':
      return beginMove(state, actor, request.target)
    case 'PICK_UP':
      return pickUp(state, actor, request.target)
    case 'DROP':
      return drop(state, actor, request.target)
    case 'USE':
      return use(state, actor, request.target)
    case 'GIVE_TO':
      return giveTo(state, actor, request.target)
    case 'TAKE_FROM':
      return takeFrom(state, actor, request.target, request.item)
    case 'BUILD':
      return build(state, actor, request.kind, request.target)
  }
}
