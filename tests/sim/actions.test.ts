import { describe, expect, it } from 'vitest'
import { addBenchSaw, addBot, addGroundItem, addPlayer, addRock, addStockpile, addTree, createWorld, getEntity } from '../../src/sim/world'
import { executeAction } from '../../src/sim/actions'
import { BENCH_SAW_RECIPE, CONTAINER_CAPACITY } from '../../src/sim/machines'
import { createBotRuntime } from '../../src/sim/vm'
import type { Instruction, Program } from '../../src/sim/program'

describe('executeAction', () => {
  it('rejects an unknown actor', () => {
    const state = createWorld(5, 5, 1)

    expect(executeAction(state, 999, { op: 'MOVE_TO', target: { x: 1, y: 1 } })).toEqual({
      ok: false,
      reason: 'unknown actor',
    })
  })

  it('rejects USE on a target that is not a resource', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const otherId = addPlayer(state, 2, 1)

    const result = executeAction(state, playerId, { op: 'USE', target: otherId })

    expect(result.ok).toBe(false)
  })

  it('rejects USE when not adjacent to the resource', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 0, 0)
    const treeId = addTree(state, 4, 4)

    const result = executeAction(state, playerId, { op: 'USE', target: treeId })

    expect(result).toEqual({ ok: false, reason: 'target is out of reach' })
  })

  it('mines a rock into stone', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const rockId = addRock(state, 2, 1)

    const result = executeAction(state, playerId, { op: 'USE', target: rockId })

    expect(result.ok).toBe(true)
    const stone = state.entities.find((entity) => entity.id === result.producedEntityId)
    expect(stone?.type).toBe('stone')
    expect(stone?.pos).toEqual({ x: 2, y: 1 })
  })

  it('rejects PICK_UP when hands are already full', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    addGroundItem(state, 'log', 1, 1)
    const player = state.entities.find((entity) => entity.id === playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    player.held = 'stone'

    const item = state.entities.find((entity) => entity.type === 'log')
    if (item === undefined) {
      throw new Error('log missing')
    }
    const result = executeAction(state, playerId, { op: 'PICK_UP', target: item.id })

    expect(result).toEqual({ ok: false, reason: 'hands are full' })
  })

  it('rejects PICK_UP when the item is on a different tile', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const itemId = addGroundItem(state, 'log', 2, 2)

    const result = executeAction(state, playerId, { op: 'PICK_UP', target: itemId })

    expect(result).toEqual({ ok: false, reason: 'target is out of reach' })
  })

  it('rejects DROP when not holding anything', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)

    const result = executeAction(state, playerId, { op: 'DROP', target: { x: 1, y: 1 } })

    expect(result).toEqual({ ok: false, reason: 'not holding anything' })
  })

  it('rejects DROP at a tile other than the actor’s own', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const player = state.entities.find((entity) => entity.id === playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    player.held = 'log'

    const result = executeAction(state, playerId, { op: 'DROP', target: { x: 2, y: 1 } })

    expect(result).toEqual({ ok: false, reason: 'can only drop at your own feet' })
    expect(player.held).toBe('log')
  })

  it('rejects MOVE_TO outside the world', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)

    const result = executeAction(state, playerId, { op: 'MOVE_TO', target: { x: -1, y: 1 } })

    expect(result).toEqual({ ok: false, reason: 'target is out of bounds' })
  })

  it('walks a multi-tile path towards a distant target', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 0, 0)

    const result = executeAction(state, playerId, { op: 'MOVE_TO', target: { x: 3, y: 0 } })
    expect(result.ok).toBe(true)

    const player = state.entities.find((entity) => entity.id === playerId)
    expect(player?.path).toEqual([{ x: 2, y: 0 }, { x: 3, y: 0 }])
    expect(player?.moveTarget).toEqual({ x: 1, y: 0 })
  })

  it('rejects starting a new action while one is already in flight', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const treeId = addTree(state, 2, 1)
    executeAction(state, playerId, { op: 'USE', target: treeId })

    const result = executeAction(state, playerId, { op: 'MOVE_TO', target: { x: 0, y: 0 } })

    expect(result).toEqual({ ok: false, reason: 'actor is busy' })
  })

  it('rejects MOVE_TO onto a blocked tile', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    addTree(state, 2, 1)

    const result = executeAction(state, playerId, { op: 'MOVE_TO', target: { x: 2, y: 1 } })

    expect(result).toEqual({ ok: false, reason: 'target is blocked' })
  })

  describe('GIVE_TO', () => {
    it('stores a held item in a stockpile', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const stockpileId = addStockpile(state, 2, 1)
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'log'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: stockpileId })

      expect(result.ok).toBe(true)
      expect(player.held).toBeNull()
      expect(getEntity(state, stockpileId)?.storage).toEqual({ log: 1 })
    })

    it('rejects GIVE_TO when not holding anything', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const stockpileId = addStockpile(state, 2, 1)

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: stockpileId })

      expect(result).toEqual({ ok: false, reason: 'not holding anything' })
    })

    it('rejects GIVE_TO a target that is not a container', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const otherId = addPlayer(state, 2, 1)
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'log'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: otherId })

      expect(result).toEqual({ ok: false, reason: 'nothing to give to there' })
    })

    it('feeds a log into a bench saw, starting its recipe', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const benchSawId = addBenchSaw(state, 2, 1)
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'log'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: benchSawId })

      expect(result.ok).toBe(true)
      expect(player.held).toBeNull()
      expect(getEntity(state, benchSawId)?.craftingUntilTick).toBe(state.tick + BENCH_SAW_RECIPE.ticks)
    })

    it('rejects feeding a bench saw a stone', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const benchSawId = addBenchSaw(state, 2, 1)
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'stone'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: benchSawId })

      expect(result).toEqual({ ok: false, reason: 'the bench saw cannot use that' })
    })

    it('rejects feeding a bench saw that is already crafting', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const benchSawId = addBenchSaw(state, 2, 1)
      const benchSaw = getEntity(state, benchSawId)
      if (benchSaw === undefined) {
        throw new Error('bench saw missing')
      }
      benchSaw.craftingUntilTick = state.tick + BENCH_SAW_RECIPE.ticks
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'log'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: benchSawId })

      expect(result).toEqual({ ok: false, reason: 'the bench saw is busy' })
    })

    it('rejects GIVE_TO when not adjacent to the container', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 0, 0)
      const stockpileId = addStockpile(state, 4, 4)
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'log'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: stockpileId })

      expect(result).toEqual({ ok: false, reason: 'target is out of reach' })
    })

    it('rejects GIVE_TO once the container is at capacity', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const stockpileId = addStockpile(state, 2, 1)
      const stockpile = getEntity(state, stockpileId)
      const player = getEntity(state, playerId)
      if (stockpile === undefined || player === undefined) {
        throw new Error('missing entity')
      }
      stockpile.storage = { log: CONTAINER_CAPACITY }
      player.held = 'log'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: stockpileId })

      expect(result).toEqual({ ok: false, reason: 'container is full' })
      expect(player.held).toBe('log')
    })
  })

  describe('WAIT', () => {
    it('idles the actor for the requested number of ticks', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)

      const result = executeAction(state, playerId, { op: 'WAIT', ticks: 10 })

      expect(result).toEqual({ ok: true })
      expect(getEntity(state, playerId)?.busyUntilTick).toBe(state.tick + 10)
    })
  })

  describe('SET_FAILURE_POLICY', () => {
    it('changes a bot’s failure policy even while it is mid-action', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)
      const program: Program = { id: 'p', name: 'noop', version: 1, instructions: [] }
      state.programs[program.id] = program
      state.botRuntimes[botId] = createBotRuntime(program.id, program)
      const bot = getEntity(state, botId)
      if (bot === undefined) {
        throw new Error('bot missing')
      }
      bot.busyUntilTick = state.tick + 100

      const result = executeAction(state, botId, { op: 'SET_FAILURE_POLICY', botId, policy: 'skip' })

      expect(result).toEqual({ ok: true })
      expect(state.botRuntimes[botId]?.failurePolicy).toBe('skip')
    })

    it('rejects setting the policy of a bot with no program assigned', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)

      const result = executeAction(state, botId, { op: 'SET_FAILURE_POLICY', botId, policy: 'halt' })

      expect(result).toEqual({ ok: false, reason: 'bot has no program assigned' })
    })
  })

  describe('TAKE_FROM', () => {
    it('takes an item out of a stockpile', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const stockpileId = addStockpile(state, 2, 1)
      const stockpile = getEntity(state, stockpileId)
      if (stockpile === undefined || stockpile.storage === null) {
        throw new Error('stockpile missing')
      }
      stockpile.storage.plank = 2

      const result = executeAction(state, playerId, { op: 'TAKE_FROM', target: stockpileId, item: 'plank' })

      expect(result.ok).toBe(true)
      expect(getEntity(state, playerId)?.held).toBe('plank')
      expect(stockpile.storage).toEqual({ plank: 1 })
    })

    it('rejects TAKE_FROM when hands are already full', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const stockpileId = addStockpile(state, 2, 1)
      const stockpile = getEntity(state, stockpileId)
      if (stockpile === undefined || stockpile.storage === null) {
        throw new Error('stockpile missing')
      }
      stockpile.storage.plank = 1
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'log'

      const result = executeAction(state, playerId, { op: 'TAKE_FROM', target: stockpileId, item: 'plank' })

      expect(result).toEqual({ ok: false, reason: 'hands are full' })
    })

    it('rejects TAKE_FROM when the container has none of that kind', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const stockpileId = addStockpile(state, 2, 1)

      const result = executeAction(state, playerId, { op: 'TAKE_FROM', target: stockpileId, item: 'plank' })

      expect(result).toEqual({ ok: false, reason: 'nothing of that kind to take' })
    })

    it('collects a finished plank from a bench saw', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const benchSawId = addBenchSaw(state, 2, 1)
      const benchSaw = getEntity(state, benchSawId)
      if (benchSaw === undefined || benchSaw.storage === null) {
        throw new Error('bench saw missing')
      }
      benchSaw.storage.plank = 1

      const result = executeAction(state, playerId, { op: 'TAKE_FROM', target: benchSawId, item: 'plank' })

      expect(result.ok).toBe(true)
      expect(getEntity(state, playerId)?.held).toBe('plank')
    })
  })

  describe('BUILD', () => {
    it('places a stockpile on an empty adjacent tile', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)

      const result = executeAction(state, playerId, { op: 'BUILD', kind: 'stockpile', target: { x: 2, y: 1 } })

      expect(result.ok).toBe(true)
      const built = getEntity(state, result.producedEntityId ?? -1)
      expect(built?.type).toBe('stockpile')
      expect(built?.storage).toEqual({})
    })

    it('places a bench saw on an empty adjacent tile', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)

      const result = executeAction(state, playerId, { op: 'BUILD', kind: 'benchSaw', target: { x: 2, y: 1 } })

      expect(result.ok).toBe(true)
      const built = getEntity(state, result.producedEntityId ?? -1)
      expect(built?.type).toBe('benchSaw')
      expect(built?.craftingUntilTick).toBeNull()
    })

    it('rejects BUILD outside the world', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 0, 0)

      const result = executeAction(state, playerId, { op: 'BUILD', kind: 'stockpile', target: { x: -1, y: 0 } })

      expect(result).toEqual({ ok: false, reason: 'target is out of bounds' })
    })

    it('rejects BUILD on a tile that is not adjacent', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 0, 0)

      const result = executeAction(state, playerId, { op: 'BUILD', kind: 'stockpile', target: { x: 4, y: 4 } })

      expect(result).toEqual({ ok: false, reason: 'target is out of reach' })
    })

    it('rejects BUILD on an occupied tile', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      addTree(state, 2, 1)

      const result = executeAction(state, playerId, { op: 'BUILD', kind: 'stockpile', target: { x: 2, y: 1 } })

      expect(result).toEqual({ ok: false, reason: 'target is occupied' })
    })
  })

  describe('EDIT_PROGRAM', () => {
    it('replaces the instructions and resets the frame stack, so an edit takes effect immediately', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const program = {
        id: 'recorded-1',
        name: 'Recorded 1',
        version: 1,
        instructions: [{ id: '1', op: 'MOVE_TO' as const, args: [{ mode: 'absolute' as const, tile: { x: 1, y: 1 } }] }],
      }
      const deployResult = executeAction(state, playerId, { op: 'DEPLOY_BOT', program })
      const botId = deployResult.producedEntityId
      expect(botId).toBeDefined()
      const runtime = state.botRuntimes[botId ?? -1]
      if (runtime === undefined) {
        throw new Error('bot runtime missing')
      }
      // Simulate the bot mid-way through its program, blocked, with a stale lastResult register.
      const frame = runtime.frames[0]
      if (frame === undefined) {
        throw new Error('frame missing')
      }
      frame.index = 5
      runtime.status = 'blocked'
      runtime.blockedReason = 'stale'
      runtime.lastResult = { kind: 'tile', tile: { x: 9, y: 9 } }

      const newInstructions = [
        { id: '2', op: 'MOVE_TO' as const, args: [{ mode: 'absolute' as const, tile: { x: 2, y: 2 } }] },
      ]
      const result = executeAction(state, botId ?? -1, { op: 'EDIT_PROGRAM', botId: botId ?? -1, instructions: newInstructions })

      expect(result).toEqual({ ok: true })
      expect(state.programs[program.id]?.instructions).toEqual(newInstructions)
      expect(runtime.frames).toEqual([{ instructions: newInstructions, index: 0, iterationsLeft: 1 }])
      expect(runtime.currentAction).toBeNull()
      expect(runtime.status).toBe('running')
      expect(runtime.blockedReason).toBeUndefined()
      expect(runtime.lastResult).toBeNull()
    })

    it('is not gated by the actor-busy check, so editing works while the bot is mid-action', () => {
      const state = createWorld(5, 5, 1)
      const botId = addPlayer(state, 1, 1)
      const program = { id: 'p', name: 'p', version: 1, instructions: [] }
      state.programs[program.id] = program
      state.botRuntimes[botId] = {
        programId: program.id,
        tier: 'mk1',
        frames: [{ instructions: [], index: 0, iterationsLeft: 1 }],
        currentAction: null,
        status: 'running',
        failurePolicy: 'wait',
        lastResult: null,
        blockedRetryAt: 0,
      }
      const busyActor = getEntity(state, botId)
      if (busyActor === undefined) {
        throw new Error('actor missing')
      }
      busyActor.busyUntilTick = state.tick + 100

      const result = executeAction(state, botId, { op: 'EDIT_PROGRAM', botId, instructions: [] })

      expect(result).toEqual({ ok: true })
    })

    it('rejects editing a bot with no program assigned', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)

      const result = executeAction(state, playerId, { op: 'EDIT_PROGRAM', botId: playerId, instructions: [] })

      expect(result).toEqual({ ok: false, reason: 'bot has no program assigned' })
    })
  })

  describe('DEPLOY_BOT', () => {
    it('spawns a running bot at the actor position and registers the program', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const program = {
        id: 'recorded-1',
        name: 'Recorded 1',
        version: 1,
        instructions: [{ id: '1', op: 'MOVE_TO' as const, args: [{ mode: 'absolute' as const, tile: { x: 1, y: 1 } }] }],
      }

      const result = executeAction(state, playerId, { op: 'DEPLOY_BOT', program })

      expect(result.ok).toBe(true)
      const botId = result.producedEntityId
      expect(botId).toBeDefined()
      const bot = getEntity(state, botId ?? -1)
      expect(bot?.type).toBe('bot')
      expect(bot?.pos).toEqual({ x: 1, y: 1 })
      expect(state.programs[program.id]).toBe(program)
      expect(state.botRuntimes[botId ?? -1]?.status).toBe('running')
      expect(state.botRuntimes[botId ?? -1]?.programId).toBe(program.id)
    })
  })

  describe('SET_BOT_TIER', () => {
    it('sets a bot’s tier', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)
      const program: Program = { id: 'p', name: 'p', version: 1, instructions: [] }
      state.programs[program.id] = program
      state.botRuntimes[botId] = createBotRuntime(program.id, program)

      const result = executeAction(state, botId, { op: 'SET_BOT_TIER', botId, tier: 'mk4' })

      expect(result).toEqual({ ok: true })
      expect(state.botRuntimes[botId]?.tier).toBe('mk4')
    })

    it('rejects setting the tier of a bot with no program assigned', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)

      const result = executeAction(state, botId, { op: 'SET_BOT_TIER', botId, tier: 'mk2' })

      expect(result).toEqual({ ok: false, reason: 'bot has no program assigned' })
    })
  })

  describe('SAVE_ROUTINE', () => {
    it('snapshots a bot’s current program into the routine library', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)
      const instructions: Instruction[] = [{ id: '1', op: 'MOVE_TO', args: [{ mode: 'absolute', tile: { x: 1, y: 1 } }] }]
      const program: Program = { id: 'p', name: 'p', version: 1, instructions }
      state.programs[program.id] = program
      state.botRuntimes[botId] = createBotRuntime(program.id, program)

      const result = executeAction(state, botId, { op: 'SAVE_ROUTINE', botId, routineId: 'r1', name: 'My routine' })

      expect(result).toEqual({ ok: true })
      expect(state.routines['r1']).toEqual({ id: 'r1', name: 'My routine', instructions, version: 1 })
    })

    it('rejects saving a routine from a bot with no program assigned', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)

      const result = executeAction(state, botId, { op: 'SAVE_ROUTINE', botId, routineId: 'r1', name: 'x' })

      expect(result).toEqual({ ok: false, reason: 'bot has no program assigned' })
    })
  })

  describe('ASSIGN_ROUTINE', () => {
    it('assigns a saved routine to a bot as a fresh program, resetting its frame stack', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)
      const oldProgram: Program = { id: 'old', name: 'old', version: 1, instructions: [] }
      state.programs[oldProgram.id] = oldProgram
      state.botRuntimes[botId] = createBotRuntime(oldProgram.id, oldProgram)
      const routineInstructions: Instruction[] = [{ id: '1', op: 'MOVE_TO', args: [{ mode: 'absolute', tile: { x: 3, y: 3 } }] }]
      state.routines['r1'] = { id: 'r1', name: 'Routine', instructions: routineInstructions, version: 1 }

      const result = executeAction(state, botId, { op: 'ASSIGN_ROUTINE', botId, routineId: 'r1', programId: 'new' })

      expect(result).toEqual({ ok: true })
      expect(state.botRuntimes[botId]?.programId).toBe('new')
      expect(state.programs['new']).toEqual({ id: 'new', name: 'Routine', instructions: routineInstructions, version: 1 })
      expect(state.botRuntimes[botId]?.frames).toEqual([{ instructions: routineInstructions, index: 0, iterationsLeft: 1 }])
      // Independent of the routine's own instructions from here on.
      expect(state.programs['new']?.instructions).not.toBe(state.routines['r1']?.instructions)
    })

    it('rejects assigning an unknown routine', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)
      const program: Program = { id: 'p', name: 'p', version: 1, instructions: [] }
      state.programs[program.id] = program
      state.botRuntimes[botId] = createBotRuntime(program.id, program)

      const result = executeAction(state, botId, { op: 'ASSIGN_ROUTINE', botId, routineId: 'missing', programId: 'new' })

      expect(result).toEqual({ ok: false, reason: 'unknown routine' })
    })
  })

  describe('COPY_PROGRAM', () => {
    it('copies one bot’s program to another as a fresh, independent program instance', () => {
      const state = createWorld(5, 5, 1)
      const fromBotId = addBot(state, 0, 0)
      const toBotId = addBot(state, 1, 0)
      const instructions: Instruction[] = [{ id: '1', op: 'MOVE_TO', args: [{ mode: 'absolute', tile: { x: 2, y: 2 } }] }]
      const sourceProgram: Program = { id: 'source', name: 'source', version: 1, instructions }
      const targetProgram: Program = { id: 'target', name: 'target', version: 1, instructions: [] }
      state.programs[sourceProgram.id] = sourceProgram
      state.programs[targetProgram.id] = targetProgram
      state.botRuntimes[fromBotId] = createBotRuntime(sourceProgram.id, sourceProgram)
      state.botRuntimes[toBotId] = createBotRuntime(targetProgram.id, targetProgram)

      const result = executeAction(state, fromBotId, { op: 'COPY_PROGRAM', fromBotId, toBotId, programId: 'copied' })

      expect(result).toEqual({ ok: true })
      expect(state.botRuntimes[toBotId]?.programId).toBe('copied')
      expect(state.programs['copied']).toEqual({ id: 'copied', name: 'source', instructions, version: 1 })
      expect(state.programs['copied']?.instructions).not.toBe(sourceProgram.instructions)
    })

    it('rejects copying when either bot has no program assigned', () => {
      const state = createWorld(5, 5, 1)
      const fromBotId = addBot(state, 0, 0)
      const toBotId = addBot(state, 1, 0)

      const result = executeAction(state, fromBotId, { op: 'COPY_PROGRAM', fromBotId, toBotId, programId: 'copied' })

      expect(result).toEqual({ ok: false, reason: 'both bots must have a program assigned' })
    })
  })
})
