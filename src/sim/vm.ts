import type { ActionRequest } from './actions'
import { executeAction, isActorBusy } from './actions'
import type { BotRuntime, Frame } from './botRuntime'
import { evaluateCondition } from './conditions'
import { isItemKind } from './entities'
import { findPathAdjacentTo } from './pathfind'
import type { Instruction } from './program'
import type { ResolvedTarget } from './targeting'
import { resolveEntityTarget, resolveTarget } from './targeting'
import type { Entity, EntityId, SimState, TileRef } from './types'
import { getEntity, isWalkable } from './world'

export type { BotRuntime, BotStatus, CurrentAction, FailurePolicy, Frame } from './botRuntime'
export { createBotRuntime, currentInstructionId } from './botRuntime'

/** One game-second at the fixed 20Hz tick rate: how often a blocked 'wait' bot retries. */
const RETRY_TICKS = 20

/** Bounds free (no-time-cost) control-flow steps within a single tick, so a malformed empty
 * REPEAT loop blocks the bot instead of hanging the tick forever. */
const CONTROL_FLOW_GUARD = 10000

/** Bounds how many routine CALLs may be nested on the bot's frame stack at once, so a self- or
 * mutually-recursive CALL fails cleanly under the failure policy instead of growing the frame
 * stack without bound. Counts only CALL-pushed frames (Frame.fromCall), not ordinary REPEAT/IF
 * nesting sharing the same stack, so a legitimately deep but non-recursive program never trips it. */
const MAX_CALL_DEPTH = 32

function toDisplayTarget(resolved: ResolvedTarget): EntityId | TileRef | null {
  switch (resolved.kind) {
    case 'entity':
      return resolved.id
    case 'tile':
      return resolved.tile
    case 'item':
      return null
  }
}

function entityResolvedTarget(state: SimState, id: EntityId): ResolvedTarget | null {
  const entity = getEntity(state, id)
  return entity === undefined ? null : { kind: 'entity', id: entity.id, pos: { ...entity.pos } }
}

/** Where MOVE_TO should walk to: onto the target tile directly if walkable, otherwise a tile adjacent to it. */
function moveDestination(state: SimState, actor: Entity, resolved: ResolvedTarget): TileRef | null {
  const targetTile = resolved.kind === 'tile' ? resolved.tile : resolved.kind === 'entity' ? resolved.pos : null
  if (targetTile === null) {
    return null
  }
  if (isWalkable(state, targetTile)) {
    return targetTile
  }
  const path = findPathAdjacentTo(state, actor.pos, targetTile)
  if (path === null) {
    return null
  }
  return path.length === 0 ? actor.pos : (path[path.length - 1] ?? null)
}

interface ExecOutcome {
  ok: boolean
  result?: ResolvedTarget | null
  reason?: string
}

function buildRequest(
  state: SimState,
  actor: Entity,
  instruction: Instruction,
  resolved: ResolvedTarget,
): { request: ActionRequest } | { reason: string } {
  switch (instruction.op) {
    case 'MOVE_TO': {
      const tile = moveDestination(state, actor, resolved)
      return tile === null ? { reason: 'no path to target' } : { request: { op: 'MOVE_TO', target: tile } }
    }
    case 'USE': {
      const id = resolveEntityTarget(state, resolved, (entity) => entity.type === 'tree' || entity.type === 'rock')
      return id === null ? { reason: 'USE needs a resource target' } : { request: { op: 'USE', target: id } }
    }
    case 'PICK_UP': {
      const id = resolveEntityTarget(state, resolved, (entity) => isItemKind(entity.type))
      return id === null ? { reason: 'PICK_UP needs an item target' } : { request: { op: 'PICK_UP', target: id } }
    }
    case 'DROP': {
      const tile = resolved.kind === 'tile' ? resolved.tile : resolved.kind === 'entity' ? resolved.pos : null
      return tile === null ? { reason: 'DROP needs a tile target' } : { request: { op: 'DROP', target: tile } }
    }
    case 'GIVE_TO': {
      const id = resolveEntityTarget(state, resolved, (entity) => entity.storage !== null)
      return id === null ? { reason: 'GIVE_TO needs a container target' } : { request: { op: 'GIVE_TO', target: id } }
    }
    case 'TAKE_FROM': {
      const id = resolveEntityTarget(state, resolved, (entity) => entity.storage !== null)
      if (id === null) {
        return { reason: 'TAKE_FROM needs a container target' }
      }
      if (instruction.item === undefined) {
        return { reason: 'TAKE_FROM instruction is missing an item' }
      }
      return { request: { op: 'TAKE_FROM', target: id, item: instruction.item } }
    }
    case 'REPEAT':
    case 'REPEAT_UNTIL':
    case 'IF':
    case 'WAIT':
    case 'CALL':
      // Control flow (REPEAT/REPEAT_UNTIL/IF/CALL) and WAIT are handled directly in stepBot's
      // loop — they never reach buildRequest, which only builds requests for target-bearing actions.
      return { reason: `${instruction.op} cannot be executed as an action` }
  }
}

/** Resolves the instruction's target and executes it. Never throws — failures come back as a reason string. */
function tryExecuteInstruction(
  state: SimState,
  botId: EntityId,
  actor: Entity,
  instruction: Instruction,
  lastResult: ResolvedTarget | null,
): ExecOutcome {
  const ref = instruction.args[0]
  if (ref === undefined) {
    return { ok: false, reason: `${instruction.op} instruction is missing a target` }
  }
  const resolved = resolveTarget(state, botId, ref, lastResult)
  if (resolved === null) {
    return { ok: false, reason: `could not resolve target for ${instruction.op}` }
  }

  const built = buildRequest(state, actor, instruction, resolved)
  if ('reason' in built) {
    return { ok: false, reason: built.reason }
  }

  const result = executeAction(state, botId, built.request)
  if (!result.ok) {
    return { ok: false, reason: result.reason ?? 'action failed' }
  }

  const output = result.producedEntityId === undefined ? resolved : entityResolvedTarget(state, result.producedEntityId)
  return { ok: true, result: output }
}

/** WAIT has no target to resolve — it just idles the actor for its own duration. */
function tryExecuteWait(state: SimState, botId: EntityId, instruction: Instruction): ExecOutcome {
  const ticks = instruction.waitTicks
  if (ticks === undefined || ticks <= 0) {
    return { ok: false, reason: 'WAIT instruction is missing a duration' }
  }
  const result = executeAction(state, botId, { op: 'WAIT', ticks })
  return result.ok ? { ok: true, result: null } : { ok: false, reason: result.reason ?? 'WAIT failed' }
}

function applyFailurePolicy(runtime: BotRuntime, frame: Frame, reason: string, tick: number): void {
  switch (runtime.failurePolicy) {
    case 'wait':
      runtime.status = 'blocked'
      runtime.blockedReason = reason
      runtime.blockedRetryAt = tick + RETRY_TICKS
      break
    case 'skip':
      frame.index += 1
      break
    case 'halt':
      runtime.status = 'halted'
      runtime.blockedReason = reason
      break
  }
}

function stepBot(state: SimState, botId: EntityId, runtime: BotRuntime): void {
  if (runtime.status === 'halted') {
    return
  }
  const actor = getEntity(state, botId)
  if (actor === undefined) {
    return
  }

  if (runtime.currentAction !== null) {
    if (isActorBusy(state, actor)) {
      // Ticks-remaining is purely informational; MOVE_TO's duration comes from movement.ts, not
      // busyUntilTick, so it reads as 0 while the bot is mid-walk.
      runtime.currentAction.ticksRemaining = Math.max(0, actor.busyUntilTick - state.tick)
      return
    }
    runtime.currentAction = null
    return
  }

  if (runtime.status === 'blocked' && state.tick < runtime.blockedRetryAt) {
    return
  }

  for (let guard = 0; guard < CONTROL_FLOW_GUARD; guard += 1) {
    const frame = runtime.frames[runtime.frames.length - 1]
    if (frame === undefined) {
      runtime.status = 'halted'
      runtime.blockedReason = 'program complete'
      return
    }

    if (frame.index >= frame.instructions.length) {
      if (frame.untilCondition !== undefined) {
        const done = evaluateCondition(state, botId, frame.untilCondition, runtime.lastResult)
        if (done) {
          runtime.frames.pop()
        } else {
          frame.index = 0
        }
      } else if (frame.iterationsLeft === null) {
        frame.index = 0
      } else {
        frame.iterationsLeft -= 1
        if (frame.iterationsLeft > 0) {
          frame.index = 0
        } else {
          runtime.frames.pop()
        }
      }
      continue
    }

    const instruction = frame.instructions[frame.index]
    if (instruction === undefined) {
      frame.index += 1
      continue
    }

    if (instruction.op === 'REPEAT') {
      frame.index += 1
      const iterationsLeft =
        instruction.params === undefined || instruction.params.mode === 'forever' ? null : instruction.params.count
      runtime.frames.push({ instructions: instruction.children ?? [], index: 0, iterationsLeft })
      continue
    }

    if (instruction.op === 'REPEAT_UNTIL') {
      frame.index += 1
      // A malformed instruction (no condition) degrades to a no-op rather than looping forever
      // with no way to ever stop — bots never throw, but they don't hang the tick either.
      if (instruction.condition === undefined) {
        continue
      }
      runtime.frames.push({
        instructions: instruction.children ?? [],
        index: 0,
        iterationsLeft: null,
        untilCondition: instruction.condition,
      })
      continue
    }

    if (instruction.op === 'IF') {
      frame.index += 1
      const conditionMet = instruction.condition !== undefined && evaluateCondition(state, botId, instruction.condition, runtime.lastResult)
      const branch = conditionMet ? instruction.children : instruction.elseChildren
      if (branch !== undefined && branch.length > 0) {
        runtime.frames.push({ instructions: branch, index: 0, iterationsLeft: 1 })
      }
      continue
    }

    if (instruction.op === 'CALL') {
      const routine = instruction.routineId === undefined ? undefined : state.routines[instruction.routineId]
      if (routine === undefined) {
        applyFailurePolicy(runtime, frame, 'unknown routine', state.tick)
        if (runtime.failurePolicy === 'skip') {
          continue
        }
        return
      }
      const callDepth = runtime.frames.filter((f) => f.fromCall === true).length
      if (callDepth >= MAX_CALL_DEPTH) {
        applyFailurePolicy(runtime, frame, 'routine call stack too deep', state.tick)
        if (runtime.failurePolicy === 'skip') {
          continue
        }
        return
      }
      frame.index += 1
      runtime.frames.push({ instructions: routine.instructions, index: 0, iterationsLeft: 1, fromCall: true })
      continue
    }

    const outcome =
      instruction.op === 'WAIT' ? tryExecuteWait(state, botId, instruction) : tryExecuteInstruction(state, botId, actor, instruction, runtime.lastResult)
    if (outcome.ok) {
      frame.index += 1
      runtime.lastResult = outcome.result ?? null
      runtime.status = 'running'
      runtime.blockedReason = undefined
      const displayTarget = outcome.result === null || outcome.result === undefined ? null : toDisplayTarget(outcome.result)
      runtime.currentAction = {
        op: instruction.op,
        resolvedTarget: displayTarget,
        ticksRemaining: Math.max(0, actor.busyUntilTick - state.tick),
        instructionId: instruction.id,
      }
      return
    }

    applyFailurePolicy(runtime, frame, outcome.reason ?? 'unknown failure', state.tick)
    if (runtime.failurePolicy === 'skip') {
      continue
    }
    return
  }

  runtime.status = 'blocked'
  runtime.blockedReason = 'no runnable instructions'
  runtime.blockedRetryAt = state.tick + RETRY_TICKS
}

/** Advances every bot's VM one tick, in stable id order. */
export function stepBots(state: SimState): void {
  const botIds = Object.keys(state.botRuntimes)
    .map(Number)
    .sort((a, b) => a - b)
  for (const id of botIds) {
    const runtime = state.botRuntimes[id]
    if (runtime !== undefined) {
      stepBot(state, id, runtime)
    }
  }
}
