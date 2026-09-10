import { describe, expect, it } from 'vitest'
import { isActorBusy } from '../../src/sim/actions'
import { generalise } from '../../src/sim/generalise'
import { buildRecordedProgram, createRecorder } from '../../src/sim/recorder'
import type { Recorder } from '../../src/sim/recorder'
import { createBotRuntime } from '../../src/sim/vm'
import { tick } from '../../src/sim/tick'
import { addBot, addPlayer, addTree, createWorld, getEntity } from '../../src/sim/world'
import type { EntityId, SimState } from '../../src/sim/types'

/** Ticks until `predicate` holds, so choreography doesn't depend on hard-coded tick counts. */
function tickUntil(state: SimState, predicate: () => boolean, maxTicks = 2000): void {
  for (let i = 0; i < maxTicks && !predicate(); i += 1) {
    tick(state)
  }
  if (!predicate()) {
    throw new Error('tickUntil: predicate never became true')
  }
}

function isIdle(state: SimState, actorId: EntityId): boolean {
  const actor = getEntity(state, actorId)
  return actor !== undefined && !isActorBusy(state, actor)
}

/** Records a chop-and-drop: walk to a tree, chop it, walk to the log, pick it up, walk home, drop it. */
function recordChopAndDrop(state: SimState, actorId: EntityId, treeId: EntityId, recorder: Recorder = createRecorder()) {
  recorder.start()

  recorder.perform(state, actorId, { op: 'MOVE_TO', target: { x: 1, y: 0 } })
  tickUntil(state, () => isIdle(state, actorId))

  recorder.perform(state, actorId, { op: 'USE', target: treeId })
  tickUntil(state, () => isIdle(state, actorId))

  const log = state.entities.find((entity) => entity.type === 'log')
  if (log === undefined) {
    throw new Error('expected a log to have spawned')
  }

  recorder.perform(state, actorId, { op: 'MOVE_TO', target: log.pos })
  tickUntil(state, () => isIdle(state, actorId))

  recorder.perform(state, actorId, { op: 'PICK_UP', target: log.id })
  tickUntil(state, () => isIdle(state, actorId))

  recorder.perform(state, actorId, { op: 'MOVE_TO', target: { x: 0, y: 0 } })
  tickUntil(state, () => isIdle(state, actorId))

  recorder.perform(state, actorId, { op: 'DROP', target: { x: 0, y: 0 } })
  tickUntil(state, () => isIdle(state, actorId))

  return recorder.stop()
}

describe('recorder', () => {
  it('records a chop-and-drop as instructions bound absolute, with no timing captured', () => {
    const state = createWorld(10, 10, 1)
    const playerId = addPlayer(state, 0, 0)
    const treeId = addTree(state, 2, 0)

    const instructions = recordChopAndDrop(state, playerId, treeId)

    expect(instructions.map((instruction) => instruction.op)).toEqual([
      'MOVE_TO',
      'USE',
      'MOVE_TO',
      'PICK_UP',
      'MOVE_TO',
      'DROP',
    ])

    // Every target is absolute — generalisation to nearestOf/inArea doesn't happen until M7.
    for (const instruction of instructions) {
      expect(instruction.args).toHaveLength(1)
      expect(instruction.args[0]?.mode).toBe('absolute')
    }

    // No WAIT, no duration, no timestamp: only the fields an instruction is allowed to carry.
    for (const instruction of instructions) {
      expect(Object.keys(instruction).sort()).toEqual(['args', 'id', 'op'])
    }

    expect(instructions[0]?.args[0]).toEqual({ mode: 'absolute', tile: { x: 1, y: 0 } })
    // USE targeted the tree's own tile, captured before it was chopped away.
    expect(instructions[1]?.args[0]).toEqual({ mode: 'absolute', tile: { x: 2, y: 0 } })
    expect(instructions[5]?.args[0]).toEqual({ mode: 'absolute', tile: { x: 0, y: 0 } })
  })

  it('a bot assigned the recorded-and-generalised program reproduces the same action sequence', () => {
    const recordedState = createWorld(10, 10, 1)
    const playerId = addPlayer(recordedState, 0, 0)
    const playerTreeId = addTree(recordedState, 2, 0)
    const recorder = createRecorder()
    const instructions = recordChopAndDrop(recordedState, playerId, playerTreeId, recorder)
    const rawProgram = buildRecordedProgram('recorded-1', 'Recorded 1', instructions)
    let idCounter = 0
    const { program } = generalise(rawProgram, recorder.lastTargetTypes(), () => `gen-${(idCounter += 1)}`)

    const botState = createWorld(10, 10, 1)
    const botId = addBot(botState, 0, 0)
    addTree(botState, 2, 0)
    botState.programs[program.id] = program
    botState.botRuntimes[botId] = createBotRuntime(program.id, program)

    // Run one full pass: chop, pick up, walk home, drop.
    tickUntil(botState, () => botState.entities.some((entity) => entity.type === 'log' && entity.pos.x === 0 && entity.pos.y === 0))

    const bot = getEntity(botState, botId)
    expect(bot?.pos).toEqual({ x: 0, y: 0 })
    expect(bot?.held).toBeNull()
    expect(botState.entities.some((entity) => entity.type === 'tree')).toBe(false)

    // REPEAT forever tries the loop again with no tree left; it must look confused and retry, never throw.
    expect(() => {
      for (let i = 0; i < 200; i += 1) {
        tick(botState)
      }
    }).not.toThrow()
  })

  it('never records a BUILD action, since bots have no BUILD opcode', () => {
    const state = createWorld(10, 10, 1)
    const playerId = addPlayer(state, 0, 0)
    const recorder = createRecorder()
    recorder.start()

    const result = recorder.perform(state, playerId, { op: 'BUILD', kind: 'stockpile', target: { x: 1, y: 0 } })

    expect(result.ok).toBe(true)
    expect(recorder.stop()).toEqual([])
  })

  it('never records a DEPLOY_BOT action, since bots have no DEPLOY_BOT opcode', () => {
    const state = createWorld(10, 10, 1)
    const playerId = addPlayer(state, 0, 0)
    const recorder = createRecorder()
    recorder.start()
    const program = buildRecordedProgram('recorded-1', 'Recorded 1', [])

    const result = recorder.perform(state, playerId, { op: 'DEPLOY_BOT', program })

    expect(result.ok).toBe(true)
    expect(recorder.stop()).toEqual([])
  })

  it('records nothing while not recording', () => {
    const state = createWorld(10, 10, 1)
    const playerId = addPlayer(state, 0, 0)
    const recorder = createRecorder()

    recorder.perform(state, playerId, { op: 'MOVE_TO', target: { x: 1, y: 0 } })

    expect(recorder.recording).toBe(false)
    expect(recorder.stop()).toEqual([])
  })

  it('does not record a failed action', () => {
    const state = createWorld(10, 10, 1)
    const playerId = addPlayer(state, 0, 0)
    const recorder = createRecorder()
    recorder.start()

    const result = recorder.perform(state, playerId, { op: 'PICK_UP', target: 999 })

    expect(result.ok).toBe(false)
    expect(recorder.stop()).toEqual([])
  })

  it('captures the target entity type for USE/PICK_UP, since generalise needs it once the target is gone', () => {
    const state = createWorld(10, 10, 1)
    const playerId = addPlayer(state, 0, 0)
    const treeId = addTree(state, 2, 0)
    const recorder = createRecorder()

    const instructions = recordChopAndDrop(state, playerId, treeId, recorder)
    const targetTypes = recorder.lastTargetTypes()

    const use = instructions.find((instruction) => instruction.op === 'USE')
    const pickUp = instructions.find((instruction) => instruction.op === 'PICK_UP')
    expect(use === undefined ? undefined : targetTypes[use.id]).toBe('tree')
    expect(pickUp === undefined ? undefined : targetTypes[pickUp.id]).toBe('log')
    // MOVE_TO/DROP have no associated entity type.
    const moveTo = instructions.find((instruction) => instruction.op === 'MOVE_TO')
    expect(moveTo === undefined ? undefined : targetTypes[moveTo.id]).toBeUndefined()
  })

  it('resets lastTargetTypes on a fresh start()', () => {
    const state = createWorld(10, 10, 1)
    const playerId = addPlayer(state, 0, 0)
    const treeId = addTree(state, 2, 0)
    const recorder = createRecorder()

    recordChopAndDrop(state, playerId, treeId, recorder)
    expect(Object.keys(recorder.lastTargetTypes()).length).toBeGreaterThan(0)

    recorder.start()
    expect(recorder.lastTargetTypes()).toEqual({})
  })
})
