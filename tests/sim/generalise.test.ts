import { describe, expect, it } from 'vitest'
import { generalise, undoGeneraliseChange } from '../../src/sim/generalise'
import type { Instruction, Program, TargetRef } from '../../src/sim/program'
import type { EntityType } from '../../src/sim/types'

function absolute(x: number, y: number): TargetRef {
  return { mode: 'absolute', tile: { x, y } }
}

function move(id: string, x: number, y: number): Instruction {
  return { id, op: 'MOVE_TO', args: [absolute(x, y)] }
}

function rawProgram(instructions: Instruction[]): Program {
  return { id: 'p', name: 'raw', version: 1, instructions }
}

function makeIdFrom(prefix: string): () => string {
  let n = 0
  return () => `${prefix}-${(n += 1)}`
}

/** Unwraps generalise's outer REPEAT forever back to a plain instruction list, for assertions. */
function unwrap(program: Program): Instruction[] {
  const [outer] = program.instructions
  if (outer === undefined || outer.op !== 'REPEAT') {
    throw new Error('expected generalise to wrap the program in REPEAT forever')
  }
  return outer.children ?? []
}

describe('generalise', () => {
  it('always wraps the result in an outer REPEAT forever, tracked as its own change', () => {
    const raw = rawProgram([move('a', 0, 0)])

    const { program, changes } = generalise(raw, {}, makeIdFrom('gen'))

    expect(program.instructions).toHaveLength(1)
    expect(program.instructions[0]?.op).toBe('REPEAT')
    expect(program.instructions[0]?.params).toEqual({ mode: 'forever' })
    const wrapChange = changes.find((change) => change.description.includes('Wrapped'))
    expect(wrapChange).toBeDefined()
    expect(wrapChange?.original).toEqual([move('a', 0, 0)])
  })

  it('collapses a run of consecutive MOVE_TO to the same tile into one', () => {
    const raw = rawProgram([move('a', 1, 0), move('b', 1, 0), move('c', 1, 0)])

    const { program, changes } = generalise(raw, {}, makeIdFrom('gen'))

    const children = unwrap(program)
    expect(children.map((instruction) => instruction.id)).toEqual(['a'])
    const collapseChange = changes.find((change) => change.description.includes('Collapsed'))
    expect(collapseChange?.original.map((instruction) => instruction.id)).toEqual(['a', 'b', 'c'])
  })

  it('does not collapse consecutive MOVE_TO to different tiles', () => {
    const raw = rawProgram([move('a', 1, 0), move('b', 2, 0)])

    const { program } = generalise(raw, {}, makeIdFrom('gen'))

    expect(unwrap(program).map((instruction) => instruction.id)).toEqual(['a', 'b'])
  })

  it('chains a MOVE_TO/USE/MOVE_TO/PICK_UP chop-and-carry sequence through nearestOf and lastResult', () => {
    const moveToTree = move('move-tree', 1, 0)
    const use: Instruction = { id: 'use', op: 'USE', args: [absolute(2, 0)] }
    const moveToLog = move('move-log', 2, 0)
    const pickUp: Instruction = { id: 'pick-up', op: 'PICK_UP', args: [absolute(2, 0)] }
    const moveHome = move('move-home', 0, 0)
    const drop: Instruction = { id: 'drop', op: 'DROP', args: [absolute(0, 0)] }
    const raw = rawProgram([moveToTree, use, moveToLog, pickUp, moveHome, drop])
    const targetTypes: Record<string, EntityType> = { use: 'tree', 'pick-up': 'log' }

    const { program } = generalise(raw, targetTypes, makeIdFrom('gen'))

    const children = unwrap(program)
    expect(children.map((instruction) => instruction.args[0])).toEqual([
      { mode: 'nearestOf', entityType: 'tree' },
      { mode: 'lastResult' },
      { mode: 'lastResult' },
      { mode: 'lastResult' },
      { mode: 'absolute', tile: { x: 0, y: 0 } },
      { mode: 'absolute', tile: { x: 0, y: 0 } },
    ])
  })

  it.each(['soil', 'tilledSoil', 'wheat'] as const)(
    'chains a MOVE_TO/USE farming step (%s) through nearestOf, the same as tree/rock',
    (entityType) => {
      const moveToTarget = move('move', 3, 0)
      const use: Instruction = { id: 'use', op: 'USE', args: [absolute(3, 0)] }
      const raw = rawProgram([moveToTarget, use])
      const targetTypes: Record<string, EntityType> = { use: entityType }

      const { program } = generalise(raw, targetTypes, makeIdFrom('gen'))

      expect(unwrap(program).map((instruction) => instruction.args[0])).toEqual([
        { mode: 'nearestOf', entityType },
        { mode: 'lastResult' },
      ])
    },
  )

  it('leaves a MOVE_TO to a building absolute, since GIVE_TO/TAKE_FROM targets never chain', () => {
    const moveToStockpile = move('move', 5, 5)
    const giveTo: Instruction = { id: 'give', op: 'GIVE_TO', args: [absolute(5, 5)] }
    const raw = rawProgram([moveToStockpile, giveTo])

    const { program, changes } = generalise(raw, {}, makeIdFrom('gen'))

    expect(unwrap(program).map((instruction) => instruction.args[0])).toEqual([
      { mode: 'absolute', tile: { x: 5, y: 5 } },
      { mode: 'absolute', tile: { x: 5, y: 5 } },
    ])
    expect(changes.some((change) => change.description.includes('Wrapped'))).toBe(true)
    expect(changes.filter((change) => !change.description.includes('Wrapped'))).toHaveLength(0)
  })

  it('leaves a trailing MOVE_TO with nothing after it absolute', () => {
    const raw = rawProgram([move('only', 3, 3)])

    const { program } = generalise(raw, {}, makeIdFrom('gen'))

    expect(unwrap(program)[0]?.args[0]).toEqual({ mode: 'absolute', tile: { x: 3, y: 3 } })
  })

  it('binds a DROP immediately following a PICK_UP to held', () => {
    const pickUp: Instruction = { id: 'pick-up', op: 'PICK_UP', args: [absolute(4, 4)] }
    const drop: Instruction = { id: 'drop', op: 'DROP', args: [absolute(4, 4)] }
    const raw = rawProgram([pickUp, drop])
    const targetTypes: Record<string, EntityType> = { 'pick-up': 'log' }

    const { program, changes } = generalise(raw, targetTypes, makeIdFrom('gen'))

    const children = unwrap(program)
    expect(children[0]?.args[0]).toEqual({ mode: 'nearestOf', entityType: 'log' })
    expect(children[1]?.args[0]).toEqual({ mode: 'held' })
    expect(changes.some((change) => change.description.includes('held'))).toBe(true)
  })
})

describe('undoGeneraliseChange', () => {
  it('undoes the outer REPEAT forever wrap, restoring the flat pre-wrap list', () => {
    const raw = rawProgram([move('a', 0, 0)])
    const { program, changes } = generalise(raw, {}, makeIdFrom('gen'))
    const wrapChange = changes.find((change) => change.description.includes('Wrapped'))
    if (wrapChange === undefined) {
      throw new Error('expected a wrap change')
    }

    const reverted = undoGeneraliseChange(program.instructions, wrapChange)

    expect(reverted).toEqual([move('a', 0, 0)])
  })

  it('undoes a single nearestOf rebind, leaving the rest of the program untouched', () => {
    const moveToTree = move('move-tree', 1, 0)
    const use: Instruction = { id: 'use', op: 'USE', args: [absolute(2, 0)] }
    const raw = rawProgram([moveToTree, use])
    const targetTypes: Record<string, EntityType> = { use: 'tree' }
    const { program, changes } = generalise(raw, targetTypes, makeIdFrom('gen'))
    const useChange = changes.find((change) => change.resultIds.includes('use'))
    if (useChange === undefined) {
      throw new Error('expected a change for the USE instruction')
    }

    const reverted = undoGeneraliseChange(program.instructions, useChange)

    const children = unwrap({ ...program, instructions: reverted })
    expect(children.find((instruction) => instruction.id === 'use')?.args[0]).toEqual({ mode: 'absolute', tile: { x: 2, y: 0 } })
    // The MOVE_TO's own rebind is untouched by undoing USE's change.
    expect(children.find((instruction) => instruction.id === 'move-tree')?.args[0]).toEqual({ mode: 'nearestOf', entityType: 'tree' })
  })

  it('undoes a MOVE_TO collapse, restoring the original run', () => {
    const raw = rawProgram([move('a', 1, 0), move('b', 1, 0), move('c', 1, 0)])
    const { program, changes } = generalise(raw, {}, makeIdFrom('gen'))
    const collapseChange = changes.find((change) => change.description.includes('Collapsed'))
    if (collapseChange === undefined) {
      throw new Error('expected a collapse change')
    }

    const reverted = undoGeneraliseChange(program.instructions, collapseChange)

    const children = unwrap({ ...program, instructions: reverted })
    expect(children.map((instruction) => instruction.id)).toEqual(['a', 'b', 'c'])
  })

  it('undoes a held-binding, restoring the DROP’s original absolute tile', () => {
    const pickUp: Instruction = { id: 'pick-up', op: 'PICK_UP', args: [absolute(4, 4)] }
    const drop: Instruction = { id: 'drop', op: 'DROP', args: [absolute(4, 4)] }
    const raw = rawProgram([pickUp, drop])
    const { program, changes } = generalise(raw, { 'pick-up': 'log' }, makeIdFrom('gen'))
    const heldChange = changes.find((change) => change.description.includes('held'))
    if (heldChange === undefined) {
      throw new Error('expected a held-binding change')
    }

    const reverted = undoGeneraliseChange(program.instructions, heldChange)

    const children = unwrap({ ...program, instructions: reverted })
    expect(children.find((instruction) => instruction.id === 'drop')?.args[0]).toEqual({ mode: 'absolute', tile: { x: 4, y: 4 } })
  })
})
