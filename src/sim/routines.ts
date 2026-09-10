import type { Instruction, Program } from './program'
import { PROGRAM_VERSION } from './program'

/** A named, saved program, independent of any bot — the library CALL and ASSIGN_ROUTINE draw from. */
export interface Routine {
  id: string
  name: string
  instructions: Instruction[]
  /** Bump on schema change; mirrors Program's own version field. */
  version: number
}

export const ROUTINE_VERSION = 1

function cloneInstructions(instructions: Instruction[]): Instruction[] {
  return JSON.parse(JSON.stringify(instructions)) as Instruction[]
}

/** Snapshots a program's current instructions into a new named routine. Independent of the source
 * program from this point on — later edits to the bot's program never leak into the saved routine. */
export function createRoutine(id: string, name: string, instructions: Instruction[]): Routine {
  return { id, name, instructions: cloneInstructions(instructions), version: ROUTINE_VERSION }
}

/** A fresh, independent program built from an existing instruction list — used to assign a routine
 * to a bot and to copy a program from one bot to another, so neither shares instruction references. */
export function instantiateProgram(programId: string, name: string, instructions: Instruction[]): Program {
  return { id: programId, name, instructions: cloneInstructions(instructions), version: PROGRAM_VERSION }
}
