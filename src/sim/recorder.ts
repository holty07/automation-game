import type { ActionRequest, ActionResult } from './actions'
import { executeAction } from './actions'
import type { Instruction, Program, TargetRef } from './program'
import { PROGRAM_VERSION } from './program'
import type { EntityId, EntityType, SimState, TileRef } from './types'
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
  /**
   * The entity type each captured instruction's target resolved to at the moment it was recorded,
   * keyed by instruction id — only set for USE/PICK_UP, whose recorded `absolute` tile alone
   * doesn't say what was there. Input to generalise's renewable-resource classification, since by
   * the time generalise runs the target itself may already be gone (chopped, picked up). Persists
   * after stop() until the next start().
   */
  lastTargetTypes(): Record<string, EntityType>
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
    case 'WAIT':
    case 'BUILD':
    case 'DEPLOY_BOT':
      // Bots have no WAIT, BUILD or DEPLOY_BOT opcode of their own to record onto, so none of
      // these are ever recordable.
      return null
    case 'EDIT_PROGRAM':
    case 'SET_FAILURE_POLICY':
    case 'SET_BOT_TIER':
    case 'SAVE_ROUTINE':
    case 'ASSIGN_ROUTINE':
    case 'COPY_PROGRAM':
    case 'UPGRADE_BOT_TIER':
      // Editor edits, not player actions — never recordable.
      return null
  }
}

/** The entity type at an instruction's target, read at the same moment as its tile — only
 * meaningful for USE/PICK_UP, whose target is a specific entity. */
function targetEntityTypeFor(state: SimState, request: ActionRequest): EntityType | null {
  switch (request.op) {
    case 'USE':
    case 'PICK_UP':
      return getEntity(state, request.target)?.type ?? null
    default:
      return null
  }
}

/** Every recorded target binds absolute — generalisation to nearestOf/inArea is generalise.ts's job. */
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
    case 'WAIT':
    case 'BUILD':
    case 'DEPLOY_BOT':
    case 'EDIT_PROGRAM':
    case 'SET_FAILURE_POLICY':
    case 'SET_BOT_TIER':
    case 'SAVE_ROUTINE':
    case 'ASSIGN_ROUTINE':
    case 'COPY_PROGRAM':
    case 'UPGRADE_BOT_TIER':
      return null
  }
}

export function createRecorder(): Recorder {
  let recording = false
  let instructions: Instruction[] = []
  let targetTypes: Record<string, EntityType> = {}
  let nextInstructionNumber = 0

  return {
    get recording(): boolean {
      return recording
    },

    start(): void {
      recording = true
      instructions = []
      targetTypes = {}
      nextInstructionNumber = 0
    },

    perform(state: SimState, actorId: EntityId, request: ActionRequest): ActionResult {
      const tile = recording ? targetTileFor(state, request) : null
      const entityType = recording ? targetEntityTypeFor(state, request) : null
      const result = executeAction(state, actorId, request)

      if (recording && result.ok && tile !== null) {
        nextInstructionNumber += 1
        const instruction = toInstruction(`rec-${nextInstructionNumber}`, request, tile)
        if (instruction !== null) {
          instructions.push(instruction)
          if (entityType !== null) {
            targetTypes[instruction.id] = entityType
          }
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

    lastTargetTypes(): Record<string, EntityType> {
      return targetTypes
    },
  }
}

/** Builds a Program shell around a finished instruction list — expected to already be
 * fully-formed (typically generalise's output, outer REPEAT forever included). */
export function buildRecordedProgram(id: string, name: string, instructions: Instruction[]): Program {
  return { id, name, version: PROGRAM_VERSION, instructions }
}
