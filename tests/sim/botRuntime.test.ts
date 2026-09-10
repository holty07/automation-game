import { describe, expect, it } from 'vitest'
import { createBotRuntime, currentInstructionId } from '../../src/sim/vm'
import type { Program } from '../../src/sim/program'

describe('currentInstructionId', () => {
  it('returns the instruction an in-flight action is running, for the editor highlight', () => {
    const program: Program = {
      id: 'p',
      name: 'x',
      version: 1,
      instructions: [{ id: '1', op: 'MOVE_TO', args: [{ mode: 'absolute', tile: { x: 0, y: 0 } }] }],
    }
    const runtime = createBotRuntime('p', program)
    runtime.currentAction = { op: 'MOVE_TO', resolvedTarget: null, ticksRemaining: 4, instructionId: '1' }

    expect(currentInstructionId(runtime)).toBe('1')
  })

  it('falls back to the next instruction to run when nothing is currently in flight', () => {
    const program: Program = {
      id: 'p',
      name: 'x',
      version: 1,
      instructions: [
        { id: '1', op: 'MOVE_TO', args: [{ mode: 'absolute', tile: { x: 0, y: 0 } }] },
        { id: '2', op: 'MOVE_TO', args: [{ mode: 'absolute', tile: { x: 1, y: 0 } }] },
      ],
    }
    const runtime = createBotRuntime('p', program)
    const frame = runtime.frames[0]
    if (frame === undefined) {
      throw new Error('frame missing')
    }
    frame.index = 1

    expect(currentInstructionId(runtime)).toBe('2')
  })

  it('returns null once the top frame has run off the end of its instruction list', () => {
    const program: Program = { id: 'p', name: 'x', version: 1, instructions: [] }
    const runtime = createBotRuntime('p', program)

    expect(currentInstructionId(runtime)).toBeNull()
  })

  it('returns null when the frame stack is empty', () => {
    const program: Program = { id: 'p', name: 'x', version: 1, instructions: [] }
    const runtime = createBotRuntime('p', program)
    runtime.frames = []

    expect(currentInstructionId(runtime)).toBeNull()
  })
})
