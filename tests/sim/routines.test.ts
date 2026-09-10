import { describe, expect, it } from 'vitest'
import { createRoutine, instantiateProgram } from '../../src/sim/routines'
import type { Instruction } from '../../src/sim/program'

const instructions: Instruction[] = [{ id: '1', op: 'MOVE_TO', args: [{ mode: 'absolute', tile: { x: 1, y: 1 } }] }]

describe('createRoutine', () => {
  it('snapshots the given instructions under a name and id', () => {
    const routine = createRoutine('r1', 'Chop loop', instructions)

    expect(routine).toEqual({ id: 'r1', name: 'Chop loop', instructions, version: 1 })
  })

  it('is independent of the source instructions from this point on', () => {
    const source = [{ id: '1', op: 'MOVE_TO' as const, args: [{ mode: 'absolute' as const, tile: { x: 1, y: 1 } }] }]
    const routine = createRoutine('r1', 'x', source)
    const first = source[0]
    if (first === undefined) {
      throw new Error('instruction missing')
    }

    first.args[0] = { mode: 'absolute', tile: { x: 9, y: 9 } }

    expect(routine.instructions[0]?.args[0]).toEqual({ mode: 'absolute', tile: { x: 1, y: 1 } })
  })
})

describe('instantiateProgram', () => {
  it('builds a fresh program from an instruction list', () => {
    const program = instantiateProgram('p1', 'Chop loop', instructions)

    expect(program).toEqual({ id: 'p1', name: 'Chop loop', instructions, version: 1 })
  })

  it('gives every instantiation its own instruction array, so bots never share one', () => {
    const programA = instantiateProgram('a', 'x', instructions)
    const programB = instantiateProgram('b', 'x', instructions)
    const first = programA.instructions[0]
    if (first === undefined) {
      throw new Error('instruction missing')
    }

    first.args[0] = { mode: 'absolute', tile: { x: 5, y: 5 } }

    expect(programB.instructions[0]?.args[0]).toEqual({ mode: 'absolute', tile: { x: 1, y: 1 } })
  })
})
