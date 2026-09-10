import type { BotRuntime, FailurePolicy } from './botRuntime'
import type { BotTier, Instruction, Program } from './program'
import { createRoutine, instantiateProgram } from './routines'
import type { EntityId, SimState } from './types'

/** Editor edits to a bot's program, tier, failure policy or routine assignment — never a timed
 * actor action, so each of these must work even while the bot is mid-action. Split out of
 * actions.ts to keep that file focused on physical world actions; executeAction is still the only
 * caller, so it remains the single entry point every mutation flows through. */

interface EditResult {
  ok: boolean
  reason?: string
}

function fail(reason: string): EditResult {
  return { ok: false, reason }
}

/** Resets a bot's frame stack to the top of `program`, so a freshly assigned or edited program
 * takes effect immediately without disturbing the bot's position, held item or world state. */
function resetRuntimeForNewProgram(runtime: BotRuntime, program: Program): void {
  runtime.frames = [{ instructions: program.instructions, index: 0, iterationsLeft: 1 }]
  runtime.currentAction = null
  runtime.status = 'running'
  runtime.blockedReason = undefined
  runtime.lastResult = null
  runtime.blockedRetryAt = 0
}

/** Replaces a bot's program instructions in place — an editor edit, not a new program. */
export function editProgram(state: SimState, botId: EntityId, instructions: Instruction[]): EditResult {
  const runtime = state.botRuntimes[botId]
  if (runtime === undefined) {
    return fail('bot has no program assigned')
  }
  const program = state.programs[runtime.programId]
  if (program === undefined) {
    return fail('unknown program')
  }
  program.instructions = instructions
  resetRuntimeForNewProgram(runtime, program)
  return { ok: true }
}

/** Sets a bot's failure policy directly — a player choice in the editor. */
export function setFailurePolicy(state: SimState, botId: EntityId, policy: FailurePolicy): EditResult {
  const runtime = state.botRuntimes[botId]
  if (runtime === undefined) {
    return fail('bot has no program assigned')
  }
  runtime.failurePolicy = policy
  return { ok: true }
}

/** Sets a bot's tier directly — gates its instruction cap and opcode availability from here on. */
export function setBotTier(state: SimState, botId: EntityId, tier: BotTier): EditResult {
  const runtime = state.botRuntimes[botId]
  if (runtime === undefined) {
    return fail('bot has no program assigned')
  }
  runtime.tier = tier
  return { ok: true }
}

/** Snapshots a bot's current program into the named routine library, independent of further edits. */
export function saveRoutine(state: SimState, botId: EntityId, routineId: string, name: string): EditResult {
  const runtime = state.botRuntimes[botId]
  if (runtime === undefined) {
    return fail('bot has no program assigned')
  }
  const program = state.programs[runtime.programId]
  if (program === undefined) {
    return fail('unknown program')
  }
  state.routines[routineId] = createRoutine(routineId, name, program.instructions)
  return { ok: true }
}

/** Assigns a saved routine to a bot as a brand new program — a copy, so later edits to the bot's
 * program never leak back into the routine library or any other bot assigned the same routine. */
export function assignRoutine(state: SimState, botId: EntityId, routineId: string, programId: string): EditResult {
  const runtime = state.botRuntimes[botId]
  if (runtime === undefined) {
    return fail('bot has no program assigned')
  }
  const routine = state.routines[routineId]
  if (routine === undefined) {
    return fail('unknown routine')
  }
  const program = instantiateProgram(programId, routine.name, routine.instructions)
  state.programs[programId] = program
  runtime.programId = programId
  resetRuntimeForNewProgram(runtime, program)
  return { ok: true }
}

/** Copies one bot's current program to another bot, in one click — a fresh, independent program
 * instance, so the two bots never share instructions. */
export function copyProgram(state: SimState, fromBotId: EntityId, toBotId: EntityId, programId: string): EditResult {
  const fromRuntime = state.botRuntimes[fromBotId]
  const toRuntime = state.botRuntimes[toBotId]
  if (fromRuntime === undefined || toRuntime === undefined) {
    return fail('both bots must have a program assigned')
  }
  const sourceProgram = state.programs[fromRuntime.programId]
  if (sourceProgram === undefined) {
    return fail('unknown source program')
  }
  const program = instantiateProgram(programId, sourceProgram.name, sourceProgram.instructions)
  state.programs[programId] = program
  toRuntime.programId = programId
  resetRuntimeForNewProgram(toRuntime, program)
  return { ok: true }
}
