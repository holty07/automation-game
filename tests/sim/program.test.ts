import { describe, expect, it } from 'vitest'
import { countScriptInstructions, instructionCap, migrate, validate } from '../../src/sim/program'
import type { Instruction, Program } from '../../src/sim/program'

function moveInstruction(id: string): Instruction {
  return { id, op: 'MOVE_TO', args: [{ mode: 'nearestOf', entityType: 'tree' }] }
}

describe('validate', () => {
  it('accepts a small program within a mk1 tier cap', () => {
    const program: Program = {
      id: 'p1',
      name: 'chop',
      version: 1,
      instructions: [moveInstruction('1'), { id: '2', op: 'USE', args: [{ mode: 'lastResult' }] }],
    }

    expect(validate(program, 'mk1')).toEqual({ ok: true, errors: [] })
  })

  it('rejects a program over the tier instruction cap', () => {
    const instructions: Instruction[] = []
    for (let i = 0; i < 9; i += 1) {
      instructions.push(moveInstruction(String(i)))
    }
    const program: Program = { id: 'p1', name: 'too big', version: 1, instructions }

    const result = validate(program, 'mk1')

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('at most 8'))).toBe(true)
  })

  it('does not count the outer wrapping REPEAT forever against the cap', () => {
    const instructions: Instruction[] = []
    for (let i = 0; i < 8; i += 1) {
      instructions.push(moveInstruction(String(i)))
    }
    const program: Program = {
      id: 'p1',
      name: 'wrapped',
      version: 1,
      instructions: [{ id: 'outer', op: 'REPEAT', args: [], params: { mode: 'forever' }, children: instructions }],
    }

    expect(validate(program, 'mk1')).toEqual({ ok: true, errors: [] })
  })

  it('rejects an opcode not unlocked at the given tier', () => {
    const program: Program = {
      id: 'p1',
      name: 'needs mk2',
      version: 1,
      instructions: [{ id: '1', op: 'TAKE_FROM', args: [{ mode: 'nearestOf', entityType: 'stockpile' }], item: 'log' }],
    }

    const result = validate(program, 'mk1')

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('TAKE_FROM'))).toBe(true)
  })

  it('accepts that same opcode at mk2', () => {
    const program: Program = {
      id: 'p1',
      name: 'needs mk2',
      version: 1,
      instructions: [{ id: '1', op: 'TAKE_FROM', args: [{ mode: 'nearestOf', entityType: 'stockpile' }], item: 'log' }],
    }

    expect(validate(program, 'mk2')).toEqual({ ok: true, errors: [] })
  })

  it('rejects a REPEAT with no children', () => {
    const program: Program = {
      id: 'p1',
      name: 'empty repeat',
      version: 1,
      instructions: [{ id: '1', op: 'REPEAT', args: [], params: { mode: 'forever' } }],
    }

    const result = validate(program, 'mk1')

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('no children'))).toBe(true)
  })

  it('rejects a REPEAT with no params', () => {
    const program: Program = {
      id: 'p1',
      name: 'no params',
      version: 1,
      instructions: [{ id: '1', op: 'REPEAT', args: [], children: [moveInstruction('2')] }],
    }

    const result = validate(program, 'mk1')

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('missing params'))).toBe(true)
  })

  it('rejects a REPEAT count of zero or less', () => {
    const program: Program = {
      id: 'p1',
      name: 'bad count',
      version: 1,
      instructions: [
        { id: '1', op: 'REPEAT', args: [], params: { mode: 'count', count: 0 }, children: [moveInstruction('2')] },
      ],
    }

    const result = validate(program, 'mk1')

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('positive number of times'))).toBe(true)
  })

  it('rejects a TAKE_FROM missing its item', () => {
    const program: Program = {
      id: 'p1',
      name: 'no item',
      version: 1,
      instructions: [{ id: '1', op: 'TAKE_FROM', args: [{ mode: 'nearestOf', entityType: 'stockpile' }] }],
    }

    const result = validate(program, 'mk2')

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('missing an item'))).toBe(true)
  })

  it('accepts a REPEAT_UNTIL with a condition and children', () => {
    const program: Program = {
      id: 'p1',
      name: 'until',
      version: 1,
      instructions: [
        { id: '1', op: 'REPEAT_UNTIL', args: [], condition: { type: 'NOT_HOLDING' }, children: [moveInstruction('2')] },
      ],
    }

    expect(validate(program, 'mk1')).toEqual({ ok: true, errors: [] })
  })

  it('rejects a REPEAT_UNTIL missing a condition', () => {
    const program: Program = {
      id: 'p1',
      name: 'until',
      version: 1,
      instructions: [{ id: '1', op: 'REPEAT_UNTIL', args: [], children: [moveInstruction('2')] }],
    }

    const result = validate(program, 'mk1')

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('missing a condition'))).toBe(true)
  })

  it('rejects a REPEAT_UNTIL with no children', () => {
    const program: Program = {
      id: 'p1',
      name: 'until',
      version: 1,
      instructions: [{ id: '1', op: 'REPEAT_UNTIL', args: [], condition: { type: 'NOT_HOLDING' } }],
    }

    const result = validate(program, 'mk1')

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('no children'))).toBe(true)
  })

  it('accepts an IF with only an else branch', () => {
    const program: Program = {
      id: 'p1',
      name: 'if-else',
      version: 1,
      instructions: [
        { id: '1', op: 'IF', args: [], condition: { type: 'NOT_HOLDING' }, elseChildren: [moveInstruction('2')] },
      ],
    }

    expect(validate(program, 'mk1')).toEqual({ ok: true, errors: [] })
  })

  it('rejects an IF with no condition and no branches', () => {
    const program: Program = {
      id: 'p1',
      name: 'if-empty',
      version: 1,
      instructions: [{ id: '1', op: 'IF', args: [] }],
    }

    const result = validate(program, 'mk1')

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('missing a condition'))).toBe(true)
    expect(result.errors.some((error) => error.includes('no branches'))).toBe(true)
  })

  it('accepts a WAIT with a positive tick count', () => {
    const program: Program = {
      id: 'p1',
      name: 'wait',
      version: 1,
      instructions: [{ id: '1', op: 'WAIT', args: [], waitTicks: 20 }],
    }

    expect(validate(program, 'mk1')).toEqual({ ok: true, errors: [] })
  })

  it('rejects a WAIT with a non-positive tick count', () => {
    const program: Program = {
      id: 'p1',
      name: 'wait',
      version: 1,
      instructions: [{ id: '1', op: 'WAIT', args: [], waitTicks: 0 }],
    }

    const result = validate(program, 'mk1')

    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.includes('positive number of ticks'))).toBe(true)
  })
})

describe('instructionCap', () => {
  it('matches the cap enforced by validate for every tier', () => {
    expect(instructionCap('mk1')).toBe(8)
    expect(instructionCap('mk2')).toBe(20)
    expect(instructionCap('mk3')).toBe(40)
    expect(instructionCap('mk4')).toBe(100)
  })
})

describe('countScriptInstructions', () => {
  it('counts a flat instruction list', () => {
    const program: Program = {
      id: 'p1',
      name: 'flat',
      version: 1,
      instructions: [moveInstruction('1'), moveInstruction('2')],
    }

    expect(countScriptInstructions(program)).toBe(2)
  })

  it('does not count the implicit outer REPEAT forever wrapping a recorded program', () => {
    const program: Program = {
      id: 'p1',
      name: 'wrapped',
      version: 1,
      instructions: [
        {
          id: 'outer',
          op: 'REPEAT',
          args: [],
          params: { mode: 'forever' },
          children: [moveInstruction('1'), moveInstruction('2'), moveInstruction('3')],
        },
      ],
    }

    expect(countScriptInstructions(program)).toBe(3)
  })

  it('counts a nested REPEAT the player added deliberately, unlike the implicit outer wrap', () => {
    const program: Program = {
      id: 'p1',
      name: 'nested',
      version: 1,
      instructions: [
        moveInstruction('1'),
        { id: 'inner', op: 'REPEAT', args: [], params: { mode: 'count', count: 2 }, children: [moveInstruction('2')] },
      ],
    }

    expect(countScriptInstructions(program)).toBe(3)
  })
})

describe('migrate', () => {
  it('accepts version 1 program data', () => {
    const raw = { id: 'p1', name: 'x', version: 1, instructions: [] }

    expect(migrate(raw)).toEqual(raw)
  })

  it('throws on an unrecognised version', () => {
    expect(() => migrate({ id: 'p1', name: 'x', version: 2, instructions: [] })).toThrow(/version/)
  })

  it('throws on non-object input', () => {
    expect(() => migrate('nope')).toThrow()
    expect(() => migrate(null)).toThrow()
  })

  it('throws when the version field is missing', () => {
    expect(() => migrate({ id: 'p1' })).toThrow(/missing a version/)
  })
})
