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
