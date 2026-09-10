import type { Instruction } from '../sim/program'

export interface FlatRow {
  instruction: Instruction
  depth: number
  /** True only for the lone top-level REPEAT forever wrapping a recorded program — ScriptEditor
   * disables delete/duplicate/drag on this row, matching program.ts's cap-counting exemption. */
  isImplicitRoot: boolean
}

function isImplicitOuterRepeat(root: Instruction[], instruction: Instruction, depth: number): boolean {
  return (
    depth === 0 &&
    root.length === 1 &&
    root[0] === instruction &&
    instruction.op === 'REPEAT' &&
    instruction.params?.mode === 'forever'
  )
}

/** Depth-first row list for rendering: one row per instruction, indented by nesting depth. */
export function flattenForDisplay(root: Instruction[]): FlatRow[] {
  const rows: FlatRow[] = []
  function walk(list: Instruction[], depth: number): void {
    for (const instruction of list) {
      rows.push({ instruction, depth, isImplicitRoot: isImplicitOuterRepeat(root, instruction, depth) })
      if (instruction.children !== undefined) {
        walk(instruction.children, depth + 1)
      }
    }
  }
  walk(root, 0)
  return rows
}

function removeRec(list: Instruction[], id: string): { list: Instruction[]; removed: Instruction } | null {
  const index = list.findIndex((instruction) => instruction.id === id)
  if (index !== -1) {
    const removed = list[index]
    if (removed === undefined) {
      return null
    }
    return { list: [...list.slice(0, index), ...list.slice(index + 1)], removed }
  }
  for (let i = 0; i < list.length; i += 1) {
    const current = list[i]
    if (current?.children === undefined) {
      continue
    }
    const result = removeRec(current.children, id)
    if (result !== null) {
      const next = [...list]
      next[i] = { ...current, children: result.list }
      return { list: next, removed: result.removed }
    }
  }
  return null
}

/** Removes the instruction with `id` from anywhere in the tree. Null if no such id exists. */
export function removeInstruction(root: Instruction[], id: string): { root: Instruction[]; removed: Instruction } | null {
  const result = removeRec(root, id)
  return result === null ? null : { root: result.list, removed: result.removed }
}

function cloneWithNewIds(instruction: Instruction, makeId: () => string): Instruction {
  return {
    ...instruction,
    id: makeId(),
    children: instruction.children?.map((child) => cloneWithNewIds(child, makeId)),
    elseChildren: instruction.elseChildren?.map((child) => cloneWithNewIds(child, makeId)),
  }
}

function insertAfterRec(list: Instruction[], id: string, makeNode: (found: Instruction) => Instruction): Instruction[] | null {
  const index = list.findIndex((instruction) => instruction.id === id)
  if (index !== -1) {
    const found = list[index]
    if (found === undefined) {
      return null
    }
    return [...list.slice(0, index + 1), makeNode(found), ...list.slice(index + 1)]
  }
  for (let i = 0; i < list.length; i += 1) {
    const current = list[i]
    if (current?.children === undefined) {
      continue
    }
    const updatedChildren = insertAfterRec(current.children, id, makeNode)
    if (updatedChildren !== null) {
      const next = [...list]
      next[i] = { ...current, children: updatedChildren }
      return next
    }
  }
  return null
}

/** Inserts a deep clone of `id`, with every node in its subtree given a fresh id via `makeId`,
 * immediately after the original. Null if `id` does not exist. */
export function duplicateInstruction(root: Instruction[], id: string, makeId: () => string): Instruction[] | null {
  return insertAfterRec(root, id, (found) => cloneWithNewIds(found, makeId))
}

/** Replaces the instruction with `id` using `update`. Null if `id` does not exist. */
export function updateInstruction(
  root: Instruction[],
  id: string,
  update: (instruction: Instruction) => Instruction,
): Instruction[] | null {
  let found = false
  function walk(list: Instruction[]): Instruction[] {
    return list.map((instruction) => {
      if (instruction.id === id) {
        found = true
        return update(instruction)
      }
      if (instruction.children !== undefined) {
        return { ...instruction, children: walk(instruction.children) }
      }
      return instruction
    })
  }
  const next = walk(root)
  return found ? next : null
}

function containsId(instruction: Instruction, id: string): boolean {
  if (instruction.id === id) {
    return true
  }
  return (instruction.children ?? []).some((child) => containsId(child, id))
}

function insertRelative(
  list: Instruction[],
  node: Instruction,
  targetId: string,
  position: DropPosition,
): Instruction[] | null {
  const index = list.findIndex((instruction) => instruction.id === targetId)
  if (index !== -1) {
    const target = list[index]
    if (target === undefined) {
      return null
    }
    if (position === 'into') {
      const next = [...list]
      next[index] = { ...target, children: [node, ...(target.children ?? [])] }
      return next
    }
    const next = [...list]
    next.splice(position === 'before' ? index : index + 1, 0, node)
    return next
  }
  for (let i = 0; i < list.length; i += 1) {
    const current = list[i]
    if (current?.children === undefined) {
      continue
    }
    const updatedChildren = insertRelative(current.children, node, targetId, position)
    if (updatedChildren !== null) {
      const next = [...list]
      next[i] = { ...current, children: updatedChildren }
      return next
    }
  }
  return null
}

export type DropPosition = 'before' | 'after' | 'into'

/**
 * Moves `sourceId` to sit before/after/inside `targetId`, anywhere in the tree — including into
 * and out of REPEAT blocks. Null if either id is missing, they're the same instruction, or the
 * move would drop an instruction into its own subtree.
 */
export function moveInstruction(
  root: Instruction[],
  sourceId: string,
  targetId: string,
  position: DropPosition,
): Instruction[] | null {
  if (sourceId === targetId) {
    return null
  }
  const removed = removeInstruction(root, sourceId)
  if (removed === null) {
    return null
  }
  if (containsId(removed.removed, targetId)) {
    return null
  }
  return insertRelative(removed.root, removed.removed, targetId, position)
}
