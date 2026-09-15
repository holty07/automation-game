import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { load } from '../../src/sim/serialise'
import { tick } from '../../src/sim/tick'
import { executeAction } from '../../src/sim/actions'
import { textDump } from '../../src/debug/textDump'
import type { SimState } from '../../src/sim/types'

function runTicks(state: SimState, count: number): void {
  for (let i = 0; i < count; i += 1) {
    tick(state)
  }
}

describe('chop, pick up and drop scenario', () => {
  it('chops a tree, carries the log and drops it', () => {
    const json = readFileSync(new URL('../fixtures/chop-pickup-drop.json', import.meta.url), 'utf8')
    const state = load(json)
    const playerId = 0
    const treeId = 1

    // Chop the adjacent tree: it stays put, mid-chop, until the cost elapses.
    const chopResult = executeAction(state, playerId, { op: 'USE', target: treeId })
    expect(chopResult.ok).toBe(true)
    expect(chopResult.producedTile).toEqual({ x: 3, y: 2 })
    expect(state.entities.find((entity) => entity.id === treeId)?.type).toBe('tree')

    // The player is busy chopping and cannot start another action yet.
    expect(executeAction(state, playerId, { op: 'MOVE_TO', target: { x: 3, y: 2 } })).toEqual({
      ok: false,
      reason: 'actor is busy',
    })

    runTicks(state, 40)

    // The tree is now a log, on the same tile.
    expect(state.entities.find((entity) => entity.id === treeId)).toBeUndefined()
    const log = state.entities.find((entity) => entity.type === 'log')
    if (log === undefined) {
      throw new Error('expected chop to produce a log entity')
    }
    expect(log.pos).toEqual({ x: 3, y: 2 })
    const logId = log.id

    // Walk onto the log's tile.
    expect(executeAction(state, playerId, { op: 'MOVE_TO', target: { x: 3, y: 2 } }).ok).toBe(true)
    runTicks(state, 4)
    const playerAfterMove = state.entities.find((entity) => entity.id === playerId)
    expect(playerAfterMove?.pos).toEqual({ x: 3, y: 2 })
    expect(playerAfterMove?.moveTarget).toBeNull()

    // Pick up the log.
    const pickUpResult = executeAction(state, playerId, { op: 'PICK_UP', target: logId })
    expect(pickUpResult.ok).toBe(true)
    expect(state.entities.find((entity) => entity.id === logId)).toBeUndefined()
    expect(state.entities.find((entity) => entity.id === playerId)?.held).toBe('log')

    runTicks(state, 8)

    // Drop it back at the player's feet.
    const dropResult = executeAction(state, playerId, { op: 'DROP', target: { x: 3, y: 2 } })
    expect(dropResult.ok).toBe(true)
    const droppedId = dropResult.producedEntityId
    if (droppedId === undefined) {
      throw new Error('expected drop to produce a log entity')
    }
    expect(state.entities.find((entity) => entity.id === playerId)?.held).toBeNull()
    const droppedLog = state.entities.find((entity) => entity.id === droppedId)
    expect(droppedLog?.type).toBe('log')
    expect(droppedLog?.pos).toEqual({ x: 3, y: 2 })

    expect(textDump(state)).toMatchInlineSnapshot(`
      "tick: 52
      grid:
      ......
      ......
      ......
      ......
      ......
      ......
      entities:
        1. id=0 type=player pos=(3,2) moveTarget=none held=none
        2. id=3 type=log pos=(3,2) moveTarget=none held=none
      bots:
        (none)"
    `)
  })
})
