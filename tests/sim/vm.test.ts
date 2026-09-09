import { describe, expect, it } from 'vitest'
import { addBot, addPlayer, addStockpile, addTree, createWorld, getEntity } from '../../src/sim/world'
import { tick } from '../../src/sim/tick'
import { createBotRuntime, stepBots } from '../../src/sim/vm'
import type { Instruction, Program } from '../../src/sim/program'

function runTicks(state: ReturnType<typeof createWorld>, count: number): void {
  for (let i = 0; i < count; i += 1) {
    tick(state)
  }
}

const chopProgram: Program = {
  id: 'chop',
  name: 'chop a tree',
  version: 1,
  instructions: [
    { id: '1', op: 'MOVE_TO', args: [{ mode: 'nearestOf', entityType: 'tree' }] },
    { id: '2', op: 'USE', args: [{ mode: 'lastResult' }] },
  ],
}

describe('bot VM', () => {
  it('walks to the nearest tree, chops it and carries the resulting log via lastResult', () => {
    const state = createWorld(10, 10, 1)
    const botId = addBot(state, 5, 5)
    addTree(state, 6, 5)
    state.programs[chopProgram.id] = chopProgram
    state.botRuntimes[botId] = createBotRuntime(chopProgram.id, chopProgram)

    runTicks(state, 100)

    const bot = getEntity(state, botId)
    expect(bot?.pos).toEqual({ x: 5, y: 5 })
    expect(state.entities.some((entity) => entity.type === 'tree')).toBe(false)
    expect(state.entities.some((entity) => entity.type === 'log')).toBe(true)
    expect(state.botRuntimes[botId]?.status).toBe('halted')
    expect(state.botRuntimes[botId]?.blockedReason).toBe('program complete')
  })

  it('loops REPEAT forever indefinitely', () => {
    const state = createWorld(12, 12, 1)
    const botId = addBot(state, 5, 5)
    // Plenty of trees so the bot never runs out of work within the test's tick budget.
    for (let y = 0; y < 12; y += 1) {
      if (y !== 5) {
        addTree(state, 6, y)
      }
    }
    addStockpile(state, 4, 5)
    const program: Program = {
      id: 'loop',
      name: 'chop and store forever',
      version: 1,
      instructions: [
        {
          id: 'outer',
          op: 'REPEAT',
          args: [],
          repeat: 'forever',
          children: [
            { id: '1', op: 'MOVE_TO', args: [{ mode: 'nearestOf', entityType: 'tree' }] },
            { id: '2', op: 'USE', args: [{ mode: 'lastResult' }] },
            { id: '3', op: 'MOVE_TO', args: [{ mode: 'lastResult' }] },
            { id: '4', op: 'PICK_UP', args: [{ mode: 'lastResult' }] },
            { id: '5', op: 'MOVE_TO', args: [{ mode: 'absolute', tile: { x: 4, y: 5 } }] },
            { id: '6', op: 'GIVE_TO', args: [{ mode: 'absolute', tile: { x: 4, y: 5 } }] },
          ],
        },
      ],
    }
    state.programs[program.id] = program
    state.botRuntimes[botId] = createBotRuntime(program.id, program)

    runTicks(state, 500)

    expect(state.botRuntimes[botId]?.status).toBe('running')
    const stockpile = state.entities.find((entity) => entity.type === 'stockpile')
    expect(stockpile?.storage?.log).toBeGreaterThan(0)
  })

  it('loops REPEAT n exactly n times, then continues past it', () => {
    const state = createWorld(10, 10, 1)
    const botId = addBot(state, 0, 0)
    const instructions: Instruction[] = [
      {
        id: 'outer',
        op: 'REPEAT',
        args: [],
        repeat: 3,
        children: [{ id: 'step', op: 'MOVE_TO', args: [{ mode: 'absolute', tile: { x: 0, y: 0 } }] }],
      },
      { id: 'final', op: 'MOVE_TO', args: [{ mode: 'absolute', tile: { x: 1, y: 0 } }] },
    ]
    const program: Program = { id: 'p', name: 'n-repeat', version: 1, instructions }
    state.programs[program.id] = program
    state.botRuntimes[botId] = createBotRuntime(program.id, program)

    runTicks(state, 200)

    const bot = getEntity(state, botId)
    expect(bot?.pos).toEqual({ x: 1, y: 0 })
    expect(state.botRuntimes[botId]?.status).toBe('halted')
  })

  it('wait failure policy blocks and retries every 20 ticks without throwing', () => {
    const state = createWorld(10, 10, 1)
    const botId = addBot(state, 0, 0)
    const program: Program = {
      id: 'p',
      name: 'no trees anywhere',
      version: 1,
      instructions: [{ id: '1', op: 'MOVE_TO', args: [{ mode: 'nearestOf', entityType: 'tree' }] }],
    }
    state.programs[program.id] = program
    state.botRuntimes[botId] = createBotRuntime(program.id, program, 'wait')

    tick(state)

    const runtime = state.botRuntimes[botId]
    expect(runtime?.status).toBe('blocked')
    expect(runtime?.blockedReason).toBeDefined()

    // Should not retry before 20 ticks have passed, but must retry (and stay blocked, not throw) after.
    runTicks(state, 19)
    expect(state.botRuntimes[botId]?.status).toBe('blocked')
    runTicks(state, 1)
    expect(state.botRuntimes[botId]?.status).toBe('blocked')
  })

  it('skip failure policy jumps past the failing instruction', () => {
    const state = createWorld(10, 10, 1)
    const botId = addBot(state, 0, 0)
    const program: Program = {
      id: 'p',
      name: 'skip the missing tree',
      version: 1,
      instructions: [
        { id: '1', op: 'MOVE_TO', args: [{ mode: 'nearestOf', entityType: 'tree' }] },
        { id: '2', op: 'MOVE_TO', args: [{ mode: 'absolute', tile: { x: 2, y: 0 } }] },
      ],
    }
    state.programs[program.id] = program
    state.botRuntimes[botId] = createBotRuntime(program.id, program, 'skip')

    runTicks(state, 20)

    const bot = getEntity(state, botId)
    expect(bot?.pos).toEqual({ x: 2, y: 0 })
    expect(state.botRuntimes[botId]?.status).toBe('halted')
  })

  it('halt failure policy stops the bot and flags it, never throwing', () => {
    const state = createWorld(10, 10, 1)
    const botId = addBot(state, 0, 0)
    const program: Program = {
      id: 'p',
      name: 'halts on failure',
      version: 1,
      instructions: [{ id: '1', op: 'MOVE_TO', args: [{ mode: 'nearestOf', entityType: 'tree' }] }],
    }
    state.programs[program.id] = program
    state.botRuntimes[botId] = createBotRuntime(program.id, program, 'halt')

    expect(() => runTicks(state, 5)).not.toThrow()

    const runtime = state.botRuntimes[botId]
    expect(runtime?.status).toBe('halted')
    expect(runtime?.blockedReason).toBeDefined()
  })

  it('a REPEAT with no children blocks instead of hanging the tick', () => {
    const state = createWorld(5, 5, 1)
    const botId = addBot(state, 0, 0)
    const program: Program = {
      id: 'p',
      name: 'empty loop',
      version: 1,
      instructions: [{ id: '1', op: 'REPEAT', args: [], repeat: 'forever', children: [] }],
    }
    state.programs[program.id] = program
    state.botRuntimes[botId] = createBotRuntime(program.id, program)

    expect(() => tick(state)).not.toThrow()
    expect(state.botRuntimes[botId]?.status).toBe('blocked')
  })

  it('stepBots iterates bots in stable id order', () => {
    const state = createWorld(5, 5, 1)
    addPlayer(state, 0, 0)
    const botA = addBot(state, 1, 0)
    const botB = addBot(state, 2, 0)
    const program: Program = {
      id: 'p',
      name: 'noop',
      version: 1,
      instructions: [{ id: '1', op: 'MOVE_TO', args: [{ mode: 'absolute', tile: { x: 0, y: 0 } }] }],
    }
    state.programs[program.id] = program
    state.botRuntimes[botB] = createBotRuntime(program.id, program)
    state.botRuntimes[botA] = createBotRuntime(program.id, program)

    expect(() => stepBots(state)).not.toThrow()
  })

  it('fails cleanly (never throws) when TAKE_FROM targets an empty container', () => {
    const state = createWorld(6, 6, 1)
    const botId = addBot(state, 1, 1)
    addStockpile(state, 2, 1)
    const program: Program = {
      id: 'p',
      name: 'take from empty stockpile',
      version: 1,
      instructions: [{ id: '1', op: 'TAKE_FROM', args: [{ mode: 'absolute', tile: { x: 2, y: 1 } }], item: 'log' }],
    }
    state.programs[program.id] = program
    state.botRuntimes[botId] = createBotRuntime(program.id, program, 'halt')

    expect(() => runTicks(state, 5)).not.toThrow()
    expect(state.botRuntimes[botId]?.status).toBe('halted')
  })
})

describe('createBotRuntime', () => {
  it('starts running at the top of the program', () => {
    const program: Program = { id: 'p', name: 'x', version: 1, instructions: [] }
    const runtime = createBotRuntime('p', program)

    expect(runtime.status).toBe('running')
    expect(runtime.frames).toHaveLength(1)
    expect(runtime.currentAction).toBeNull()
    expect(runtime.lastResult).toBeNull()
    expect(runtime.failurePolicy).toBe('wait')
  })
})
