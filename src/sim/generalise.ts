import { isItemKind } from './entities'
import type { Instruction, Program, TargetRef } from './program'
import type { EntityType, TileRef } from './types'

/**
 * One change generalise made. `resultIds` names the (possibly multi-node) contiguous run in the
 * generalised instruction list this change produced; `original` is what sat there before, in the
 * same position — enough to splice back in for a per-change undo.
 */
export interface GeneraliseChange {
  id: string
  description: string
  resultIds: string[]
  original: Instruction[]
}

function sameTile(a: TileRef, b: TileRef): boolean {
  return a.x === b.x && a.y === b.y
}

function absoluteTile(instruction: Instruction): TileRef | null {
  const ref = instruction.args[0]
  return ref?.mode === 'absolute' ? ref.tile : null
}

/** Trees/rocks (USE) and ground items (PICK_UP) — the "renewable/ambient resources" the design
 * calls out for nearestOf binding. Buildings/machines (GIVE_TO/TAKE_FROM targets) are deliberately
 * excluded — those stay absolute. */
function isRenewable(type: EntityType): boolean {
  return type === 'tree' || type === 'rock' || isItemKind(type)
}

/** Rule: collapse a run of consecutive MOVE_TO instructions to the same absolute tile into one. */
function collapseConsecutiveMoveTo(instructions: Instruction[], makeId: () => string): { instructions: Instruction[]; changes: GeneraliseChange[] } {
  const result: Instruction[] = []
  const changes: GeneraliseChange[] = []
  let i = 0
  while (i < instructions.length) {
    const current = instructions[i]
    if (current === undefined) {
      i += 1
      continue
    }
    const tile = current.op === 'MOVE_TO' ? absoluteTile(current) : null
    if (tile === null) {
      result.push(current)
      i += 1
      continue
    }
    const run = [current]
    let j = i + 1
    while (j < instructions.length) {
      const next = instructions[j]
      const nextTile = next?.op === 'MOVE_TO' ? absoluteTile(next) : null
      if (next === undefined || nextTile === null || !sameTile(nextTile, tile)) {
        break
      }
      run.push(next)
      j += 1
    }
    result.push(current)
    if (run.length > 1) {
      changes.push({
        id: makeId(),
        description: `Collapsed ${run.length} consecutive moves to the same tile into one`,
        resultIds: [current.id],
        original: run,
      })
    }
    i = j
  }
  return { instructions: result, changes }
}

/**
 * Rule: renewable/ambient resources (trees, rocks, loose items) bind nearestOf; buildings and
 * storage stay absolute. A MOVE_TO that walks toward one of these, and every instruction after it
 * still referring to the same interaction (USE producing a log to walk to next, say), chains
 * through lastResult instead of re-resolving nearestOf independently — reproducing the pattern
 * already established by the hand-written chop-and-store fixture. Re-resolving nearestOf on every
 * instruction is unsound: once the bot has walked to "nearest tree" and that tile is empty grass,
 * an independently-resolved USE can land on a *different*, non-adjacent tree and block forever.
 */
function classifyRenewableTargets(instructions: Instruction[], targetTypes: Record<string, EntityType>): { instructions: Instruction[]; changes: GeneraliseChange[] } {
  const result = [...instructions]
  const changes: GeneraliseChange[] = []
  let chainActive = false

  function rebind(index: number, target: TargetRef, description: string): void {
    const original = result[index]
    if (original === undefined) {
      return
    }
    const updated: Instruction = { ...original, args: [target] }
    result[index] = updated
    changes.push({ id: `change-${index}-${original.id}`, description, resultIds: [updated.id], original: [original] })
  }

  for (let i = 0; i < result.length; i += 1) {
    const instruction = result[i]
    if (instruction === undefined) {
      continue
    }

    if (instruction.op === 'MOVE_TO') {
      if (chainActive) {
        rebind(i, { mode: 'lastResult' }, 'Move now targets the previous step’s result')
        continue
      }
      const next = result[i + 1]
      const nextType = next !== undefined && (next.op === 'USE' || next.op === 'PICK_UP') ? targetTypes[next.id] : undefined
      if (nextType !== undefined && isRenewable(nextType)) {
        rebind(i, { mode: 'nearestOf', entityType: nextType }, `Move now targets the nearest ${nextType}`)
        chainActive = true
      }
      continue
    }

    if (instruction.op === 'USE' || instruction.op === 'PICK_UP') {
      const type = targetTypes[instruction.id]
      if (type !== undefined && isRenewable(type)) {
        if (chainActive) {
          rebind(i, { mode: 'lastResult' }, `${instruction.op === 'USE' ? 'Use' : 'Pick up'} now targets the previous step’s result`)
        } else {
          rebind(i, { mode: 'nearestOf', entityType: type }, `${instruction.op === 'USE' ? 'Use' : 'Pick up'} now targets the nearest ${type}`)
        }
        // USE produces a new entity worth chaining to (the log/stone it yields); PICK_UP consumes
        // its target into hand, leaving nothing new to walk toward next.
        chainActive = instruction.op === 'USE'
        continue
      }
      chainActive = false
      continue
    }

    // DROP, GIVE_TO, TAKE_FROM: buildings and fixed drop points stay absolute, per design.
    chainActive = false
  }

  return { instructions: result, changes }
}

/** Rule: a PICK_UP immediately followed by a DROP binds that DROP to whatever is now held —
 * nothing else could be in hand, since nothing intervened between picking it up and dropping it. */
function bindDropToHeld(instructions: Instruction[]): { instructions: Instruction[]; changes: GeneraliseChange[] } {
  const result = [...instructions]
  const changes: GeneraliseChange[] = []
  for (let i = 0; i < result.length - 1; i += 1) {
    const pickUp = result[i]
    const drop = result[i + 1]
    if (pickUp?.op === 'PICK_UP' && drop?.op === 'DROP') {
      const updated: Instruction = { ...drop, args: [{ mode: 'held' }] }
      result[i + 1] = updated
      changes.push({
        id: `change-drop-${drop.id}`,
        description: 'Drop now targets whatever is held, since it immediately follows picking it up',
        resultIds: [updated.id],
        original: [drop],
      })
    }
  }
  return { instructions: result, changes }
}

/** Rule: wrap the whole program in one outer REPEAT forever, so the bot runs it continuously. */
function wrapInRepeatForever(instructions: Instruction[], makeId: () => string): { instructions: Instruction[]; changes: GeneraliseChange[] } {
  const wrapperId = makeId()
  const wrapper: Instruction = { id: wrapperId, op: 'REPEAT', args: [], params: { mode: 'forever' }, children: instructions }
  return {
    instructions: [wrapper],
    changes: [
      {
        id: makeId(),
        description: 'Wrapped the whole program in REPEAT forever',
        resultIds: [wrapperId],
        original: instructions,
      },
    ],
  }
}

/**
 * Runs the generalise pass on a freshly recorded program: classifies renewable-resource targets,
 * collapses redundant moves, binds a pick-up/drop pair to `held`, and wraps the result in an outer
 * REPEAT forever. `targetTypes` comes from the recorder's `lastTargetTypes()` — the entity type
 * each USE/PICK_UP instruction's target resolved to at record time, since the target itself may no
 * longer exist in `state` by the time this runs.
 */
export function generalise(program: Program, targetTypes: Record<string, EntityType>, makeId: () => string): { program: Program; changes: GeneraliseChange[] } {
  const changes: GeneraliseChange[] = []

  const collapsed = collapseConsecutiveMoveTo(program.instructions, makeId)
  changes.push(...collapsed.changes)

  const classified = classifyRenewableTargets(collapsed.instructions, targetTypes)
  changes.push(...classified.changes)

  const held = bindDropToHeld(classified.instructions)
  changes.push(...held.changes)

  const wrapped = wrapInRepeatForever(held.instructions, makeId)
  changes.push(...wrapped.changes)

  return { program: { ...program, instructions: wrapped.instructions }, changes }
}

function replaceRun(list: Instruction[], resultIds: string[], original: Instruction[]): Instruction[] | null {
  const firstId = resultIds[0]
  const startIndex = firstId === undefined ? -1 : list.findIndex((instruction) => instruction.id === firstId)
  if (startIndex !== -1) {
    return [...list.slice(0, startIndex), ...original, ...list.slice(startIndex + resultIds.length)]
  }
  for (let i = 0; i < list.length; i += 1) {
    const current = list[i]
    if (current === undefined) {
      continue
    }
    if (current.children !== undefined) {
      const updatedChildren = replaceRun(current.children, resultIds, original)
      if (updatedChildren !== null) {
        const next = [...list]
        next[i] = { ...current, children: updatedChildren }
        return next
      }
    }
    if (current.elseChildren !== undefined) {
      const updatedElseChildren = replaceRun(current.elseChildren, resultIds, original)
      if (updatedElseChildren !== null) {
        const next = [...list]
        next[i] = { ...current, elseChildren: updatedElseChildren }
        return next
      }
    }
  }
  return null
}

/** Reverts one generalise change: splices `change.original` back in wherever `change.resultIds`
 * currently sits (searching nested `children`/`elseChildren` too, since a change may be inside the
 * outer wrap or, once the player has been editing, inside an IF's branches). */
export function undoGeneraliseChange(instructions: Instruction[], change: GeneraliseChange): Instruction[] {
  return replaceRun(instructions, change.resultIds, change.original) ?? instructions
}
