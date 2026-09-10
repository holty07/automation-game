import { assignRoutine, copyProgram, editProgram, saveRoutine, setBotTier, setFailurePolicy, upgradeBotTier } from './botControl'
import { hasStockedCost, BOT_TIER_COSTS, deductStockedCost } from './botCosts'
import { createBotRuntime, type FailurePolicy } from './botRuntime'
import { createGroundItem, getActionCost, isItemKind, staticEntity } from './entities'
import { BUILDING_COSTS, CONTAINER_CAPACITY, createBlueprint, recipesFor, totalStored } from './machines'
import type { BotTier, Instruction, Program } from './program'
import type { BuildableType, Entity, EntityId, ItemKind, SimState, TileRef } from './types'
import { use } from './useVerb'
import { addEntity, entitiesAt, getEntity, inBounds, isWalkable, removeEntity } from './world'
import { findPath, isAdjacent } from './pathfind'

export type { BuildableType } from './types'

export type ActionRequest =
  | { op: 'MOVE_TO'; target: TileRef }
  | { op: 'PICK_UP'; target: EntityId }
  | { op: 'DROP'; target: TileRef }
  | { op: 'USE'; target: EntityId }
  | { op: 'GIVE_TO'; target: EntityId }
  | { op: 'TAKE_FROM'; target: EntityId; item: ItemKind }
  | { op: 'WAIT'; ticks: number }
  | { op: 'BUILD'; kind: BuildableType; target: TileRef }
  | { op: 'DEPLOY_BOT'; program: Program }
  | { op: 'EDIT_PROGRAM'; botId: EntityId; instructions: Instruction[] }
  | { op: 'SET_FAILURE_POLICY'; botId: EntityId; policy: FailurePolicy }
  | { op: 'SET_BOT_TIER'; botId: EntityId; tier: BotTier }
  | { op: 'SAVE_ROUTINE'; botId: EntityId; routineId: string; name: string }
  | { op: 'ASSIGN_ROUTINE'; botId: EntityId; routineId: string; programId: string }
  | { op: 'COPY_PROGRAM'; fromBotId: EntityId; toBotId: EntityId; programId: string }
  | { op: 'UPGRADE_BOT_TIER'; botId: EntityId }

export interface ActionResult {
  ok: boolean
  reason?: string
  producedEntityId?: EntityId
}

function fail(reason: string): ActionResult {
  return { ok: false, reason }
}

/** Whether an actor is still mid-action: walking, or waiting out a busyUntilTick cooldown. */
export function isActorBusy(state: SimState, actor: Entity): boolean {
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

  if (totalStored(target.storage) >= CONTAINER_CAPACITY) {
    return fail('container is full')
  }

  const heldKind = actor.held

  if (target.type === 'blueprint') {
    const kind = target.blueprintOf
    const needed = kind === null ? undefined : BUILDING_COSTS[kind][heldKind]
    if (needed === undefined) {
      return fail('the blueprint does not need that')
    }
    if ((target.storage[heldKind] ?? 0) >= needed) {
      return fail('the blueprint already has enough of that')
    }
    const cost = getActionCost('GIVE_TO', heldKind)
    target.storage[heldKind] = (target.storage[heldKind] ?? 0) + 1
    actor.held = null
    actor.busyUntilTick = state.tick + cost
    return { ok: true }
  }

  const recipes = recipesFor(target.type)
  if (recipes !== null) {
    const recipe = recipes[heldKind]
    if (recipe === undefined) {
      return fail('the machine cannot use that')
    }
    if (target.craftingUntilTick !== null) {
      return fail('the machine is busy')
    }
    const cost = getActionCost('GIVE_TO', heldKind)
    actor.held = null
    actor.busyUntilTick = state.tick + cost
    target.craftingUntilTick = state.tick + recipe.ticks
    target.craftingOutput = recipe.output
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
  const producedEntityId = addEntity(state, createBlueprint(kind, target))
  actor.busyUntilTick = state.tick + cost
  return { ok: true, producedEntityId }
}

/** Spawns a Mk1 bot at the actor's own position and assigns it the finished program, already
 * running — costed from stockpiles across the world (see botCosts.ts). */
function deployBot(state: SimState, actor: Entity, program: Program): ActionResult {
  const cost = BOT_TIER_COSTS.mk1
  if (!hasStockedCost(state, cost)) {
    return fail('not enough materials in a stockpile to build a Mk1 bot')
  }
  deductStockedCost(state, cost)
  state.programs[program.id] = program
  const botId = addEntity(state, staticEntity('bot', actor.pos))
  state.botRuntimes[botId] = createBotRuntime(program.id, program)
  return { ok: true, producedEntityId: botId }
}

function wait(state: SimState, actor: Entity, ticks: number): ActionResult {
  actor.busyUntilTick = state.tick + Math.max(0, ticks)
  return { ok: true }
}

/**
 * The only function that mutates the world. Every action a player or bot takes flows through here.
 * (vm.ts writes directly to a bot's own entry in `SimState.botRuntimes` — that's VM-internal program
 * counter/call-stack bookkeeping, not world state, so it's exempt from this rule.)
 *
 * EDIT_PROGRAM, SET_FAILURE_POLICY, SET_BOT_TIER, SAVE_ROUTINE, ASSIGN_ROUTINE, COPY_PROGRAM and
 * UPGRADE_BOT_TIER are all handled before the actor lookup: they're editor edits, not an actor
 * performing a timed action, so they must work even while the bot is mid-action.
 */
export function executeAction(state: SimState, actorId: EntityId, request: ActionRequest): ActionResult {
  if (request.op === 'EDIT_PROGRAM') {
    return editProgram(state, request.botId, request.instructions)
  }
  if (request.op === 'SET_FAILURE_POLICY') {
    return setFailurePolicy(state, request.botId, request.policy)
  }
  if (request.op === 'SET_BOT_TIER') {
    return setBotTier(state, request.botId, request.tier)
  }
  if (request.op === 'SAVE_ROUTINE') {
    return saveRoutine(state, request.botId, request.routineId, request.name)
  }
  if (request.op === 'ASSIGN_ROUTINE') {
    return assignRoutine(state, request.botId, request.routineId, request.programId)
  }
  if (request.op === 'COPY_PROGRAM') {
    return copyProgram(state, request.fromBotId, request.toBotId, request.programId)
  }
  if (request.op === 'UPGRADE_BOT_TIER') {
    return upgradeBotTier(state, request.botId)
  }

  const actor = getEntity(state, actorId)
  if (actor === undefined) {
    return fail('unknown actor')
  }
  if (isActorBusy(state, actor)) {
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
    case 'WAIT':
      return wait(state, actor, request.ticks)
    case 'BUILD':
      return build(state, actor, request.kind, request.target)
    case 'DEPLOY_BOT':
      return deployBot(state, actor, request.program)
  }
}
