import type { EntityType, ItemKind, TileRef } from './types'

export type Opcode =
  | 'MOVE_TO'
  | 'PICK_UP'
  | 'DROP'
  | 'USE'
  | 'TAKE_FROM'
  | 'GIVE_TO'
  | 'REPEAT'
  | 'REPEAT_UNTIL'
  | 'IF'
  | 'WAIT'
  | 'CALL'

/** A reference to something in the world, with a binding mode that survives the world changing underneath it. */
export type TargetRef =
  | { mode: 'absolute'; tile: TileRef }
  | { mode: 'nearestOf'; entityType: EntityType; radius?: number }
  | { mode: 'inArea'; entityType: EntityType; areaId: string }
  | { mode: 'held' }
  | { mode: 'lastResult' }
  | { mode: 'marker'; markerId: string }

/** REPEAT's loop count. */
export type RepeatParams = { mode: 'forever' } | { mode: 'count'; count: number }

/** REPEAT_UNTIL and IF's branch conditions. A container reference is itself a TargetRef, so it can
 * bind absolute/nearestOf/marker just like any other target. */
export type Condition =
  | { type: 'HOLDING'; item: ItemKind }
  | { type: 'NOT_HOLDING' }
  | { type: 'EXISTS_NEARBY'; entityType: EntityType; radius?: number }
  | { type: 'CONTAINER_HAS'; container: TargetRef; item: ItemKind }
  | { type: 'CONTAINER_FULL'; container: TargetRef }
  | { type: 'INVENTORY_FULL' }

export interface Instruction {
  /** Stable uuid — the editor's drag handle. */
  id: string
  op: Opcode
  /** Targets only — never a literal like a count, a duration or a condition. */
  args: TargetRef[]
  /** REPEAT/REPEAT_UNTIL's loop body, or IF's true branch. */
  children?: Instruction[]
  /** IF's false branch only. */
  elseChildren?: Instruction[]
  /** REPEAT's loop count. */
  params?: RepeatParams
  /** REPEAT_UNTIL and IF only. */
  condition?: Condition
  /** WAIT only: how many ticks to idle. */
  waitTicks?: number
  /** TAKE_FROM only: which item kind to withdraw. */
  item?: ItemKind
  /** CALL only: which saved routine to run inline. */
  routineId?: string
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

const TIER_RANK: Record<BotTier, number> = { mk1: 0, mk2: 1, mk3: 2, mk4: 3 }

/** Instruction cap per bot tier, from the design plan's bot-tier table (section 2). */
const MAX_INSTRUCTIONS: Record<BotTier, number> = { mk1: 8, mk2: 20, mk3: 40, mk4: 100 }

/**
 * The tier an opcode first becomes available at, from the same table. `REPEAT forever` is mk1 —
 * it's the mechanic that makes automation work at all, so it's never gated — but a `REPEAT` with a
 * fixed count is mk2, checked separately in `validate` since it's the same opcode either way.
 */
const OPCODE_MIN_TIER: Record<Opcode, BotTier> = {
  MOVE_TO: 'mk1',
  PICK_UP: 'mk1',
  DROP: 'mk1',
  USE: 'mk1',
  REPEAT: 'mk1',
  TAKE_FROM: 'mk2',
  GIVE_TO: 'mk2',
  WAIT: 'mk2',
  REPEAT_UNTIL: 'mk3',
  IF: 'mk3',
  CALL: 'mk4',
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
  return only !== undefined && only.op === 'REPEAT' && only.params?.mode === 'forever'
}

/** The instruction cap for a bot tier, as enforced by `validate`. Used by the editor UI to show
 * the counter without re-deriving the tier table. */
export function instructionCap(tier: BotTier): number {
  return MAX_INSTRUCTIONS[tier]
}

/** Whether `op` is unlocked at `tier`, per the design plan's bot-tier table. A REPEAT with a fixed
 * count additionally requires mk2 even though REPEAT itself is unlocked at mk1 — check that
 * separately via the instruction's own params, not through this opcode-level gate. Used both by
 * `validate` and by the editor's "add instruction" palette. */
export function isOpcodeAvailable(op: Opcode, tier: BotTier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[OPCODE_MIN_TIER[op]]
}

/** Instruction count against the cap: the implicit outer REPEAT forever wrapping a recorded
 * program does not count, but a REPEAT the player added deliberately does. */
export function countScriptInstructions(program: Program): number {
  const wrapped = isWrappedInOuterRepeatForever(program.instructions)
  const countedInstructions = wrapped ? (program.instructions[0]?.children ?? []) : program.instructions
  return countInstructions(countedInstructions)
}

/**
 * Checks a program against a bot tier's instruction cap and opcode allowlist. The implicit
 * outer REPEAT forever that wraps a recorded program does not count against the cap.
 */
export function validate(program: Program, tier: BotTier): ValidationResult {
  const errors: string[] = []
  const cap = MAX_INSTRUCTIONS[tier]

  const instructionCount = countScriptInstructions(program)
  if (instructionCount > cap) {
    errors.push(`program has ${instructionCount} instructions, but ${tier} allows at most ${cap}`)
  }

  const usedOpcodes = new Set<Opcode>()
  for (const instruction of walkAll(program.instructions)) {
    usedOpcodes.add(instruction.op)
  }
  for (const op of usedOpcodes) {
    if (!isOpcodeAvailable(op, tier)) {
      errors.push(`opcode ${op} is not available on ${tier}`)
    }
  }

  for (const instruction of walkAll(program.instructions)) {
    if (instruction.op === 'REPEAT') {
      if (instruction.params === undefined) {
        errors.push(`REPEAT instruction ${instruction.id} is missing params`)
      } else if (instruction.params.mode === 'count') {
        if (instruction.params.count <= 0) {
          errors.push(`REPEAT instruction ${instruction.id} must repeat a positive number of times`)
        }
        if (TIER_RANK[tier] < TIER_RANK.mk2) {
          errors.push(`REPEAT instruction ${instruction.id} needs a fixed count, which is not available on ${tier}`)
        }
      }
      if (instruction.children === undefined || instruction.children.length === 0) {
        errors.push(`REPEAT instruction ${instruction.id} has no children`)
      }
    }
    if (instruction.op === 'CALL' && instruction.routineId === undefined) {
      errors.push(`CALL instruction ${instruction.id} is missing a routineId`)
    }
    if (instruction.op === 'TAKE_FROM' && instruction.item === undefined) {
      errors.push(`TAKE_FROM instruction ${instruction.id} is missing an item`)
    }
    if (instruction.op === 'REPEAT_UNTIL') {
      if (instruction.condition === undefined) {
        errors.push(`REPEAT_UNTIL instruction ${instruction.id} is missing a condition`)
      }
      if (instruction.children === undefined || instruction.children.length === 0) {
        errors.push(`REPEAT_UNTIL instruction ${instruction.id} has no children`)
      }
    }
    if (instruction.op === 'IF') {
      if (instruction.condition === undefined) {
        errors.push(`IF instruction ${instruction.id} is missing a condition`)
      }
      const hasChildren = instruction.children !== undefined && instruction.children.length > 0
      const hasElseChildren = instruction.elseChildren !== undefined && instruction.elseChildren.length > 0
      if (!hasChildren && !hasElseChildren) {
        errors.push(`IF instruction ${instruction.id} has no branches`)
      }
    }
    if (instruction.op === 'WAIT' && (instruction.waitTicks === undefined || instruction.waitTicks <= 0)) {
      errors.push(`WAIT instruction ${instruction.id} must wait a positive number of ticks`)
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
