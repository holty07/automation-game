import type { EntityType, ItemKind, TileRef } from './types'

/** Opcodes implemented by this milestone's VM. REPEAT_UNTIL, IF/ELSE, WAIT and CALL arrive later. */
export type Opcode = 'MOVE_TO' | 'PICK_UP' | 'DROP' | 'USE' | 'TAKE_FROM' | 'GIVE_TO' | 'REPEAT'

/** A reference to something in the world, with a binding mode that survives the world changing underneath it. */
export type TargetRef =
  | { mode: 'absolute'; tile: TileRef }
  | { mode: 'nearestOf'; entityType: EntityType; radius?: number }
  | { mode: 'inArea'; entityType: EntityType; areaId: string }
  | { mode: 'held' }
  | { mode: 'lastResult' }
  | { mode: 'marker'; markerId: string }

export interface Instruction {
  /** Stable uuid — the editor's drag handle. */
  id: string
  op: Opcode
  args: TargetRef[]
  /** REPEAT's loop body. */
  children?: Instruction[]
  elseChildren?: Instruction[]
  /** REPEAT only: how many passes to make, or 'forever'. */
  repeat?: number | 'forever'
  /** TAKE_FROM only: which item kind to withdraw. */
  item?: ItemKind
}

export interface Program {
  id: string
  name: string
  instructions: Instruction[]
  /** Bump on schema change; migrate() rejects anything it doesn't recognise. */
  version: number
}

export const PROGRAM_VERSION = 1

export type BotTier = 'mk1' | 'mk2' | 'mk3' | 'mk4'

interface TierSpec {
  maxInstructions: number
  opcodes: readonly Opcode[]
}

/** Cost, cap and unlocked opcodes per bot tier, from the design plan's bot-tier table (section 2). */
const TIER_SPECS: Record<BotTier, TierSpec> = {
  mk1: { maxInstructions: 8, opcodes: ['MOVE_TO', 'PICK_UP', 'DROP', 'USE', 'REPEAT'] },
  mk2: { maxInstructions: 20, opcodes: ['MOVE_TO', 'PICK_UP', 'DROP', 'USE', 'REPEAT', 'TAKE_FROM', 'GIVE_TO'] },
  mk3: { maxInstructions: 40, opcodes: ['MOVE_TO', 'PICK_UP', 'DROP', 'USE', 'REPEAT', 'TAKE_FROM', 'GIVE_TO'] },
  mk4: { maxInstructions: 100, opcodes: ['MOVE_TO', 'PICK_UP', 'DROP', 'USE', 'REPEAT', 'TAKE_FROM', 'GIVE_TO'] },
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
}

function* walkAll(instructions: Instruction[]): Generator<Instruction> {
  for (const instruction of instructions) {
    yield instruction
    if (instruction.children !== undefined) {
      yield* walkAll(instruction.children)
    }
    if (instruction.elseChildren !== undefined) {
      yield* walkAll(instruction.elseChildren)
    }
  }
}

function countInstructions(instructions: Instruction[]): number {
  let count = instructions.length
  for (const instruction of instructions) {
    if (instruction.children !== undefined) {
      count += countInstructions(instruction.children)
    }
    if (instruction.elseChildren !== undefined) {
      count += countInstructions(instruction.elseChildren)
    }
  }
  return count
}

/** True if the whole program is exactly one top-level REPEAT forever wrapping everything else. */
function isWrappedInOuterRepeatForever(instructions: Instruction[]): boolean {
  if (instructions.length !== 1) {
    return false
  }
  const [only] = instructions
  return only !== undefined && only.op === 'REPEAT' && only.repeat === 'forever'
}

/**
 * Checks a program against a bot tier's instruction cap and opcode allowlist. The implicit
 * outer REPEAT forever that wraps a recorded program does not count against the cap.
 */
export function validate(program: Program, tier: BotTier): ValidationResult {
  const errors: string[] = []
  const spec = TIER_SPECS[tier]

  const wrapped = isWrappedInOuterRepeatForever(program.instructions)
  const countedInstructions = wrapped ? (program.instructions[0]?.children ?? []) : program.instructions
  const instructionCount = countInstructions(countedInstructions)
  if (instructionCount > spec.maxInstructions) {
    errors.push(`program has ${instructionCount} instructions, but ${tier} allows at most ${spec.maxInstructions}`)
  }

  const usedOpcodes = new Set<Opcode>()
  for (const instruction of walkAll(program.instructions)) {
    usedOpcodes.add(instruction.op)
  }
  for (const op of usedOpcodes) {
    if (!spec.opcodes.includes(op)) {
      errors.push(`opcode ${op} is not available on ${tier}`)
    }
  }

  for (const instruction of walkAll(program.instructions)) {
    if (instruction.op === 'REPEAT') {
      if (instruction.repeat === undefined) {
        errors.push(`REPEAT instruction ${instruction.id} is missing a repeat count`)
      } else if (instruction.repeat !== 'forever' && instruction.repeat <= 0) {
        errors.push(`REPEAT instruction ${instruction.id} must repeat a positive number of times`)
      }
      if (instruction.children === undefined || instruction.children.length === 0) {
        errors.push(`REPEAT instruction ${instruction.id} has no children`)
      }
    }
    if (instruction.op === 'TAKE_FROM' && instruction.item === undefined) {
      errors.push(`TAKE_FROM instruction ${instruction.id} is missing an item`)
    }
  }

  return { ok: errors.length === 0, errors }
}

/** Rejects any program version this build doesn't understand, rather than blindly trusting the JSON. */
export function migrate(raw: unknown): Program {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Program data must be a JSON object.')
  }
  if (!('version' in raw)) {
    throw new Error('Program data is missing a version field.')
  }
  const version = (raw as { version: unknown }).version
  if (version !== PROGRAM_VERSION) {
    throw new Error(`Unknown program version: ${String(version)}. This build supports version ${PROGRAM_VERSION}.`)
  }
  return raw as Program
}
