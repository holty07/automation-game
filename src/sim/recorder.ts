import type { ActionRequest, ActionResult } from './actions'
import { executeAction } from './actions'
import type { Instruction, Program, TargetRef } from './program'
import { PROGRAM_VERSION } from './program'
import type { EntityId, SimState, TileRef } from './types'
import { getEntity } from './world'

export interface Recorder {
  readonly recording: boolean
  /** Begins a new recording, discarding any instructions from a previous one that was never assigned. */
  start(): void
  /**
   * Taps executeAction: runs `request` exactly as it would run unrecorded, and while recording is
   * active, appends the equivalent Instruction whenever the action actually commits.
   */
  perform(state: SimState, actorId: EntityId, request: ActionRequest): ActionResult
  /** Ends the recording and returns everything captured, back-to-back with no timing information. */
  stop(): Instruction[]
}

/** The tile a committed action targeted, read before executeAction runs so an entity target that
 * the action removes (a chopped tree, a picked-up item) still leaves behind its last position. */
function targetTileFor(state: SimState, request: ActionRequest): TileRef | null {
  switch (request.op) {
    case 'MOVE_TO':
    case 'DROP':
      return request.target
    case 'PICK_UP':
    case 'USE':
    case 'GIVE_TO':
    case 'TAKE_FROM':
      return getEntity(state, request.target)?.pos ?? null
    case 'BUILD':
    case 'DEPLOY_BOT':
      // Bots have no BUILD or DEPLOY_BOT opcode, so neither is ever recordable.
      return null
  }
}

/** Every recorded target binds absolute — generalisation to nearestOf/inArea is M7's job. */
function toInstruction(id: string, request: ActionRequest, tile: TileRef): Instruction | null {
  const target: TargetRef = { mode: 'absolute', tile }
  switch (request.op) {
    case 'MOVE_TO':
      return { id, op: 'MOVE_TO', args: [target] }
    case 'PICK_UP':
      return { id, op: 'PICK_UP', args: [target] }
    case 'DROP':
      return { id, op: 'DROP', args: [target] }
    case 'USE':
      return { id, op: 'USE', args: [target] }
    case 'GIVE_TO':
      return { id, op: 'GIVE_TO', args: [target] }
    case 'TAKE_FROM':
      return { id, op: 'TAKE_FROM', args: [target], item: request.item }
    case 'BUILD':
    case 'DEPLOY_BOT':
      return null
  }
}

export function createRecorder(): Recorder {
  let recording = false
  let instructions: Instruction[] = []
  let nextInstructionNumber = 0

  return {
    get recording(): boolean {
      return recording
    },

    start(): void {
      recording = true
      instructions = []
      nextInstructionNumber = 0
    },

    perform(state: SimState, actorId: EntityId, request: ActionRequest): ActionResult {
      const tile = recording ? targetTileFor(state, request) : null
      const result = executeAction(state, actorId, request)

      if (recording && result.ok && tile !== null) {
        nextInstructionNumber += 1
        const instruction = toInstruction(`rec-${nextInstructionNumber}`, request, tile)
        if (instruction !== null) {
          instructions.push(instruction)
        }
      }

      return result
    },

    stop(): Instruction[] {
      recording = false
      const recorded = instructions
      instructions = []
      return recorded
    },
  }
}

/** Wraps a freshly recorded instruction list in the implicit outer REPEAT forever and gives it a Program shell. */
export function buildRecordedProgram(id: string, name: string, instructions: Instruction[]): Program {
  return {
    id,
    name,
    version: PROGRAM_VERSION,
    instructions: [
      { id: `${id}-loop`, op: 'REPEAT', args: [], params: { mode: 'forever' }, children: instructions },
    ],
  }
}
