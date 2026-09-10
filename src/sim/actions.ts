import { createBotRuntime, type FailurePolicy } from './botRuntime'
import { createGroundItem, getActionCost, isItemKind, RESOURCE_YIELD, staticEntity } from './entities'
import { BENCH_SAW_RECIPE, CONTAINER_CAPACITY, createBenchSaw, createStockpile, totalStored } from './machines'
import type { Instruction, Program } from './program'
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
  | { op: 'WAIT'; ticks: number }
  | { op: 'BUILD'; kind: BuildableType; target: TileRef }
  | { op: 'DEPLOY_BOT'; program: Program }
  | { op: 'EDIT_PROGRAM'; botId: EntityId; instructions: Instruction[] }
  | { op: 'SET_FAILURE_POLICY'; botId: EntityId; policy: FailurePolicy }

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

  if (totalStored(target.storage) >= CONTAINER_CAPACITY) {
    return fail('container is full')
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

/** Spawns a bot at the actor's own position and assigns it the finished program, already running. */
function deployBot(state: SimState, actor: Entity, program: Program): ActionResult {
  state.programs[program.id] = program
  const botId = addEntity(state, staticEntity('bot', actor.pos))
  state.botRuntimes[botId] = createBotRuntime(program.id, program)
  return { ok: true, producedEntityId: botId }
}

/** Replaces a bot's program instructions and resets its frame stack, so an editor edit takes
 * effect immediately without disturbing the bot's position, held item or world state. */
function editProgram(state: SimState, botId: EntityId, instructions: Instruction[]): ActionResult {
  const runtime = state.botRuntimes[botId]
  if (runtime === undefined) {
    return fail('bot has no program assigned')
  }
  const program = state.programs[runtime.programId]
  if (program === undefined) {
    return fail('unknown program')
  }
  program.instructions = instructions
  runtime.frames = [{ instructions: program.instructions, index: 0, iterationsLeft: 1 }]
  runtime.currentAction = null
  runtime.status = 'running'
  runtime.blockedReason = undefined
  runtime.lastResult = null
  runtime.blockedRetryAt = 0
  return { ok: true }
}

function wait(state: SimState, actor: Entity, ticks: number): ActionResult {
  actor.busyUntilTick = state.tick + Math.max(0, ticks)
  return { ok: true }
}

/** Sets a bot's failure policy directly — a player choice in the editor, not a timed action, so
 * it must work even while the bot is mid-action. */
function setFailurePolicy(state: SimState, botId: EntityId, policy: FailurePolicy): ActionResult {
  const runtime = state.botRuntimes[botId]
  if (runtime === undefined) {
    return fail('bot has no program assigned')
  }
  runtime.failurePolicy = policy
  return { ok: true }
}

/**
 * The only function that mutates the world. Every action a player or bot takes flows through here.
 * (vm.ts writes directly to a bot's own entry in `SimState.botRuntimes` — that's VM-internal program
 * counter/call-stack bookkeeping, not world state, so it's exempt from this rule.)
 *
 * EDIT_PROGRAM and SET_FAILURE_POLICY are handled before the actor lookup: they're editor edits,
 * not an actor performing a timed action, so they must work even while the bot is mid-action.
 */
export function executeAction(state: SimState, actorId: EntityId, request: ActionRequest): ActionResult {
  if (request.op === 'EDIT_PROGRAM') {
    return editProgram(state, request.botId, request.instructions)
  }
  if (request.op === 'SET_FAILURE_POLICY') {
    return setFailurePolicy(state, request.botId, request.policy)
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
