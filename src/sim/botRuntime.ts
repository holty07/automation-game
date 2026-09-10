import type { Instruction, Opcode, Program } from './program'
import type { ResolvedTarget } from './targeting'
import type { EntityId, TileRef } from './types'

/** A frame of the bot's call stack: a running position through one instruction list. */
export interface Frame {
  instructions: Instruction[]
  index: number
  /** null = loop forever (REPEAT forever); otherwise passes left, decremented each completed pass. */
  iterationsLeft: number | null
}

export type FailurePolicy = 'wait' | 'skip' | 'halt'

export interface CurrentAction {
  op: Opcode
  resolvedTarget: EntityId | TileRef | null
  ticksRemaining: number
  /** The instruction this action came from — the editor's live execution highlight. */
  instructionId: string
}

export type BotStatus = 'running' | 'blocked' | 'halted'

export interface BotRuntime {
  programId: string
  frames: Frame[]
  currentAction: CurrentAction | null
  status: BotStatus
  blockedReason?: string
  failurePolicy: FailurePolicy
  /** Register holding the previous instruction's result, read by the `lastResult` target binding. */
  lastResult: ResolvedTarget | null
  /** Under the 'wait' failure policy, the tick at which resolution should be retried. */
  blockedRetryAt: number
}

/**
 * Kept in its own leaf module, separate from vm.ts, so actions.ts's `DEPLOY_BOT` handler can build a
 * BotRuntime without importing the interpreter itself (which imports actions.ts for executeAction).
 */
export function createBotRuntime(programId: string, program: Program, failurePolicy: FailurePolicy = 'wait'): BotRuntime {
  return {
    programId,
    frames: [{ instructions: program.instructions, index: 0, iterationsLeft: 1 }],
    currentAction: null,
    status: 'running',
    failurePolicy,
    lastResult: null,
    blockedRetryAt: 0,
  }
}

/**
 * The instruction id the editor should highlight: whatever action is currently in flight, or
 * failing that the next instruction the top frame is about to run. Null once a frame has run
 * off the end of its instruction list (about to loop or pop) or the call stack is empty.
 */
export function currentInstructionId(runtime: BotRuntime): string | null {
  if (runtime.currentAction !== null) {
    return runtime.currentAction.instructionId
  }
  const frame = runtime.frames[runtime.frames.length - 1]
  if (frame === undefined) {
    return null
  }
  return frame.instructions[frame.index]?.id ?? null
}
