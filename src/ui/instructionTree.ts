import type { Instruction } from '../sim/program'

export interface FlatRow {
  instruction: Instruction
  depth: number
  /** True only for the lone top-level REPEAT forever wrapping a recorded program — ScriptEditor
   * disables delete/duplicate/drag on this row, matching program.ts's cap-counting exemption. */
  isImplicitRoot: boolean
}

/** Appends a new instruction to the end of the program's user-visible top level — inside the
 * implicit outer REPEAT forever's children, if the program has been wrapped, otherwise the root. */
export function appendInstruction(root: Instruction[], instruction: Instruction): Instruction[] {
  const only = root.length === 1 ? root[0] : undefined
  if (only !== undefined && only.op === 'REPEAT' && only.params?.mode === 'forever') {
    return [{ ...only, children: [...(only.children ?? []), instruction] }]
  }
  return [...root, instruction]
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

/** Depth-first row list for rendering: one row per instruction, indented by nesting depth. IF's
 * elseChildren render as further rows at the same depth as children, right after them. */
export function flattenForDisplay(root: Instruction[]): FlatRow[] {
  const rows: FlatRow[] = []
  function walk(list: Instruction[], depth: number): void {
    for (const instruction of list) {
      rows.push({ instruction, depth, isImplicitRoot: isImplicitOuterRepeat(root, instruction, depth) })
      if (instruction.children !== undefined) {
        walk(instruction.children, depth + 1)
      }
      if (instruction.elseChildren !== undefined) {
        walk(instruction.elseChildren, depth + 1)
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
    if (current === undefined) {
      continue
    }
    if (current.children !== undefined) {
      const result = removeRec(current.children, id)
      if (result !== null) {
        const next = [...list]
        next[i] = { ...current, children: result.list }
        return { list: next, removed: result.removed }
      }
    }
    if (current.elseChildren !== undefined) {
      const result = removeRec(current.elseChildren, id)
      if (result !== null) {
        const next = [...list]
        next[i] = { ...current, elseChildren: result.list }
        return { list: next, removed: result.removed }
      }
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
    if (current === undefined) {
      continue
    }
    if (current.children !== undefined) {
      const updatedChildren = insertAfterRec(current.children, id, makeNode)
      if (updatedChildren !== null) {
        const next = [...list]
        next[i] = { ...current, children: updatedChildren }
        return next
      }
    }
    if (current.elseChildren !== undefined) {
      const updatedElseChildren = insertAfterRec(current.elseChildren, id, makeNode)
      if (updatedElseChildren !== null) {
        const next = [...list]
        next[i] = { ...current, elseChildren: updatedElseChildren }
        return next
      }
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
      let next = instruction
      if (next.children !== undefined) {
        next = { ...next, children: walk(next.children) }
      }
      if (next.elseChildren !== undefined) {
        next = { ...next, elseChildren: walk(next.elseChildren) }
      }
      return next
    })
  }
  const next = walk(root)
  return found ? next : null
}

function containsId(instruction: Instruction, id: string): boolean {
  if (instruction.id === id) {
    return true
  }
  return (instruction.children ?? []).some((child) => containsId(child, id)) || (instruction.elseChildren ?? []).some((child) => containsId(child, id))
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
    if (current === undefined) {
      continue
    }
    if (current.children !== undefined) {
      const updatedChildren = insertRelative(current.children, node, targetId, position)
      if (updatedChildren !== null) {
        const next = [...list]
        next[i] = { ...current, children: updatedChildren }
        return next
      }
    }
    if (current.elseChildren !== undefined) {
      const updatedElseChildren = insertRelative(current.elseChildren, node, targetId, position)
      if (updatedElseChildren !== null) {
        const next = [...list]
        next[i] = { ...current, elseChildren: updatedElseChildren }
        return next
      }
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
