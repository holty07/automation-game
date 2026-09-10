import { describe, expect, it } from 'vitest'
import {
  duplicateInstruction,
  flattenForDisplay,
  moveInstruction,
  removeInstruction,
  updateInstruction,
} from '../../src/ui/instructionTree'
import type { Instruction } from '../../src/sim/program'

function move(id: string, x = 0, y = 0): Instruction {
  return { id, op: 'MOVE_TO', args: [{ mode: 'absolute', tile: { x, y } }] }
}

function repeat(id: string, children: Instruction[]): Instruction {
  return { id, op: 'REPEAT', args: [], params: { mode: 'forever' }, children }
}

describe('flattenForDisplay', () => {
  it('flattens a flat list at depth 0', () => {
    const root = [move('1'), move('2')]

    expect(flattenForDisplay(root)).toEqual([
      { instruction: root[0], depth: 0, isImplicitRoot: false },
      { instruction: root[1], depth: 0, isImplicitRoot: false },
    ])
  })

  it('indents a REPEAT block’s children by one depth', () => {
    const root = [move('1'), repeat('outer', [move('2'), move('3')])]

    const rows = flattenForDisplay(root)

    expect(rows.map((row) => [row.instruction.id, row.depth])).toEqual([
      ['1', 0],
      ['outer', 0],
      ['2', 1],
      ['3', 1],
    ])
  })

  it('marks only a lone top-level REPEAT forever as the implicit root', () => {
    const wrapped = [repeat('outer', [move('1'), move('2')])]

    const rows = flattenForDisplay(wrapped)

    expect(rows.find((row) => row.instruction.id === 'outer')?.isImplicitRoot).toBe(true)
    expect(rows.find((row) => row.instruction.id === '1')?.isImplicitRoot).toBe(false)
  })

  it('does not treat a nested REPEAT as the implicit root', () => {
    const root = [move('1'), repeat('inner', [move('2')])]

    const rows = flattenForDisplay(root)

    expect(rows.find((row) => row.instruction.id === 'inner')?.isImplicitRoot).toBe(false)
  })

  it('does not treat a REPEAT forever as the implicit root when it is not the only top-level instruction', () => {
    const root = [move('1'), repeat('outer', [move('2')])]

    const rows = flattenForDisplay(root)

    expect(rows.find((row) => row.instruction.id === 'outer')?.isImplicitRoot).toBe(false)
  })
})

describe('removeInstruction', () => {
  it('removes a top-level instruction', () => {
    const root = [move('1'), move('2')]

    const result = removeInstruction(root, '1')

    expect(result?.root).toEqual([move('2')])
    expect(result?.removed).toEqual(move('1'))
  })

  it('removes a nested instruction, leaving the rest of its siblings', () => {
    const root = [repeat('outer', [move('1'), move('2')])]

    const result = removeInstruction(root, '1')

    expect(result?.root).toEqual([repeat('outer', [move('2')])])
  })

  it('returns null for an id that does not exist', () => {
    const root = [move('1')]

    expect(removeInstruction(root, 'missing')).toBeNull()
  })
})

describe('duplicateInstruction', () => {
  it('inserts a copy right after the original with a freshly minted id', () => {
    const root = [move('1'), move('2')]
    let counter = 0

    const result = duplicateInstruction(root, '1', () => `new-${(counter += 1)}`)

    expect(result?.map((instruction) => instruction.id)).toEqual(['1', 'new-1', '2'])
    expect(result?.[1]).toMatchObject({ op: 'MOVE_TO', args: move('1').args })
  })

  it('assigns fresh ids to every node in a duplicated subtree', () => {
    const root = [repeat('outer', [move('1')])]
    let counter = 0

    const result = duplicateInstruction(root, 'outer', () => `new-${(counter += 1)}`)

    expect(result?.map((instruction) => instruction.id)).toEqual(['outer', 'new-1'])
    const clone = result?.[1]
    expect(clone?.children?.[0]?.id).toBe('new-2')
    expect(clone?.children?.[0]?.id).not.toBe('1')
  })

  it('returns null for an id that does not exist', () => {
    expect(duplicateInstruction([move('1')], 'missing', () => 'x')).toBeNull()
  })
})

describe('updateInstruction', () => {
  it('replaces the targeted instruction and leaves its siblings untouched', () => {
    const root = [move('1'), move('2')]

    const result = updateInstruction(root, '1', (instruction) => ({ ...instruction, args: [{ mode: 'held' }] }))

    expect(result?.[0]?.args).toEqual([{ mode: 'held' }])
    expect(result?.[1]).toEqual(move('2'))
  })

  it('updates a nested instruction', () => {
    const root = [repeat('outer', [move('1')])]

    const result = updateInstruction(root, '1', (instruction) => ({ ...instruction, args: [{ mode: 'held' }] }))

    expect(result?.[0]?.children?.[0]?.args).toEqual([{ mode: 'held' }])
  })

  it('returns null for an id that does not exist', () => {
    expect(updateInstruction([move('1')], 'missing', (i) => i)).toBeNull()
  })
})

describe('moveInstruction', () => {
  it('moves an instruction before another one in the same list', () => {
    const root = [move('1'), move('2'), move('3')]

    const result = moveInstruction(root, '3', '1', 'before')

    expect(result?.map((i) => i.id)).toEqual(['3', '1', '2'])
  })

  it('moves an instruction after another one in the same list', () => {
    const root = [move('1'), move('2'), move('3')]

    const result = moveInstruction(root, '1', '2', 'after')

    expect(result?.map((i) => i.id)).toEqual(['2', '1', '3'])
  })

  it('moves an instruction into a REPEAT block’s children', () => {
    const root = [move('1'), repeat('outer', [move('2')])]

    const result = moveInstruction(root, '1', 'outer', 'into')

    expect(result?.map((i) => i.id)).toEqual(['outer'])
    expect(result?.[0]?.children?.map((i) => i.id)).toEqual(['1', '2'])
  })

  it('moves an instruction out of a REPEAT block back to the top level', () => {
    const root = [repeat('outer', [move('1'), move('2')]), move('3')]

    const result = moveInstruction(root, '1', '3', 'before')

    expect(result?.map((i) => i.id)).toEqual(['outer', '1', '3'])
    expect(result?.find((i) => i.id === 'outer')?.children?.map((i) => i.id)).toEqual(['2'])
  })

  it('refuses to move an instruction into its own subtree', () => {
    const root = [repeat('outer', [move('1')])]

    expect(moveInstruction(root, 'outer', '1', 'into')).toBeNull()
  })

  it('refuses to move an instruction relative to itself', () => {
    const root = [move('1'), move('2')]

    expect(moveInstruction(root, '1', '1', 'after')).toBeNull()
  })

  it('returns null when the source id does not exist', () => {
    expect(moveInstruction([move('1')], 'missing', '1', 'after')).toBeNull()
  })

  it('returns null when the target id does not exist', () => {
    expect(moveInstruction([move('1'), move('2')], '1', 'missing', 'after')).toBeNull()
  })
})
