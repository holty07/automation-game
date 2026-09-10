import type { EntityType, ItemKind, TileRef } from './types'

/** Opcodes implemented by this milestone's VM. CALL arrives with bot tiers in M8. */
export type Opcode = 'MOVE_TO' | 'PICK_UP' | 'DROP' | 'USE' | 'TAKE_FROM' | 'GIVE_TO' | 'REPEAT' | 'REPEAT_UNTIL' | 'IF' | 'WAIT'

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

/**
 * Cost, cap and unlocked opcodes per bot tier, from the design plan's bot-tier table (section 2).
 * The design table would gate REPEAT_UNTIL/IF/WAIT to mk2/mk3, but bot tiers aren't a real feature
 * yet — every bot is treated as mk1 until M8 (see ScriptEditor's CURRENT_TIER) — and REPEAT with a
 * count param is already ungated at mk1 today despite the same table saying that's mk2-only. These
 * opcodes are ungated everywhere too, for consistency, so they're actually usable this milestone.
 */
const ALL_OPCODES: readonly Opcode[] = [
  'MOVE_TO',
  'PICK_UP',
  'DROP',
  'USE',
  'REPEAT',
  'REPEAT_UNTIL',
  'IF',
  'WAIT',
  'TAKE_FROM',
  'GIVE_TO',
]
const TIER_SPECS: Record<BotTier, TierSpec> = {
  mk1: { maxInstructions: 8, opcodes: ALL_OPCODES.filter((op) => op !== 'TAKE_FROM' && op !== 'GIVE_TO') },
  mk2: { maxInstructions: 20, opcodes: ALL_OPCODES },
  mk3: { maxInstructions: 40, opcodes: ALL_OPCODES },
  mk4: { maxInstructions: 100, opcodes: ALL_OPCODES },
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
  return TIER_SPECS[tier].maxInstructions
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
  const spec = TIER_SPECS[tier]

  const instructionCount = countScriptInstructions(program)
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
      if (instruction.params === undefined) {
        errors.push(`REPEAT instruction ${instruction.id} is missing params`)
      } else if (instruction.params.mode === 'count' && instruction.params.count <= 0) {
        errors.push(`REPEAT instruction ${instruction.id} must repeat a positive number of times`)
      }
      if (instruction.children === undefined || instruction.children.length === 0) {
        errors.push(`REPEAT instruction ${instruction.id} has no children`)
      }
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
