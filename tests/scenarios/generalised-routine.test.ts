import { describe, expect, it } from 'vitest'
import { isActorBusy } from '../../src/sim/actions'
import { generalise } from '../../src/sim/generalise'
import { findPathAdjacentTo } from '../../src/sim/pathfind'
import { buildRecordedProgram, createRecorder } from '../../src/sim/recorder'
import { tick } from '../../src/sim/tick'
import type { EntityId, SimState, TileRef } from '../../src/sim/types'
import { createBotRuntime } from '../../src/sim/vm'
import { addBot, addPlayer, addStockpile, addTree, createWorld, getEntity } from '../../src/sim/world'

/**
 * Enough trees, spread far enough apart, that a chop-and-store loop can run 2000 ticks without
 * exhausting its supply — sizing worked out from the action-cost table (a full cycle costs roughly
 * `2 * MOVE_TICKS_PER_TILE * distance + 56` ticks; with distances growing 1..30 as nearer trees are
 * consumed, that's ~5400 ticks to exhaust all 30, comfortably more than the 2000-tick budget).
 */
const TREE_COUNT = 30
const WORLD_WIDTH = 40
const WORLD_HEIGHT = 10
const HOME: TileRef = { x: 35, y: 5 }
const STOCKPILE: TileRef = { x: 34, y: 5 }

function buildWorld(): SimState {
  const state = createWorld(WORLD_WIDTH, WORLD_HEIGHT, 1)
  for (let i = 0; i < TREE_COUNT; i += 1) {
    addTree(state, 2 + i, 5)
  }
  addStockpile(state, STOCKPILE.x, STOCKPILE.y)
  return state
}

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

/** The same tile MOVE_TO would resolve to at replay time: adjacent to a blocking target, directly
 * onto a walkable one. */
function adjacentTile(state: SimState, from: TileRef, target: TileRef): TileRef {
  const path = findPathAdjacentTo(state, from, target)
  if (path === null) {
    throw new Error('no path to target')
  }
  return path.length === 0 ? from : (path[path.length - 1] ?? from)
}

describe('generalised routine scenario', () => {
  it('a recorded 6-step chop-and-store routine, once generalised, runs 2000 ticks without ever becoming blocked', () => {
    const recordState = buildWorld()
    const playerId = addPlayer(recordState, HOME.x, HOME.y)
    const player = getEntity(recordState, playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    const tree = recordState.entities.find((entity) => entity.type === 'tree')
    if (tree === undefined) {
      throw new Error('expected at least one tree')
    }

    const recorder = createRecorder()
    recorder.start()

    // 1. Walk to the tree, 2. chop it.
    recorder.perform(recordState, playerId, { op: 'MOVE_TO', target: adjacentTile(recordState, player.pos, tree.pos) })
    tickUntil(recordState, () => isIdle(recordState, playerId))
    recorder.perform(recordState, playerId, { op: 'USE', target: tree.id })
    tickUntil(recordState, () => isIdle(recordState, playerId))

    const log = recordState.entities.find((entity) => entity.type === 'log')
    if (log === undefined) {
      throw new Error('expected a log to have spawned')
    }

    // 3. Walk to the log, 4. pick it up.
    recorder.perform(recordState, playerId, { op: 'MOVE_TO', target: log.pos })
    tickUntil(recordState, () => isIdle(recordState, playerId))
    recorder.perform(recordState, playerId, { op: 'PICK_UP', target: log.id })
    tickUntil(recordState, () => isIdle(recordState, playerId))

    const stockpile = recordState.entities.find((entity) => entity.type === 'stockpile')
    if (stockpile === undefined) {
      throw new Error('stockpile missing')
    }

    // 5. Walk to the stockpile, 6. store the log.
    recorder.perform(recordState, playerId, { op: 'MOVE_TO', target: adjacentTile(recordState, log.pos, stockpile.pos) })
    tickUntil(recordState, () => isIdle(recordState, playerId))
    recorder.perform(recordState, playerId, { op: 'GIVE_TO', target: stockpile.id })
    tickUntil(recordState, () => isIdle(recordState, playerId))

    const instructions = recorder.stop()
    expect(instructions).toHaveLength(6)

    const rawProgram = buildRecordedProgram('recorded-1', 'Chop and store', instructions)
    let idCounter = 0
    const { program } = generalise(rawProgram, recorder.lastTargetTypes(), () => `gen-${(idCounter += 1)}`)

    const botState = buildWorld()
    const botId = addBot(botState, HOME.x, HOME.y)
    botState.programs[program.id] = program
    botState.botRuntimes[botId] = createBotRuntime(program.id, program)

    for (let i = 0; i < 2000; i += 1) {
      tick(botState)
      const runtime = botState.botRuntimes[botId]
      if (runtime === undefined) {
        throw new Error('bot runtime missing')
      }
      if (runtime.status === 'blocked') {
        throw new Error(`bot blocked at tick ${botState.tick}: ${runtime.blockedReason ?? '(no reason)'}`)
      }
      if (runtime.status === 'halted') {
        throw new Error(`bot halted at tick ${botState.tick}: ${runtime.blockedReason ?? '(no reason)'}`)
      }
    }

    // Confirms real progress was made, not just an idle loop that happens never to fail.
    const finalStockpile = botState.entities.find((entity) => entity.type === 'stockpile')
    expect(finalStockpile?.storage?.log ?? 0).toBeGreaterThan(0)
  })
})
