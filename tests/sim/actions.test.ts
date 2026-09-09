import { describe, expect, it } from 'vitest'
import { addGroundItem, addPlayer, addRock, addTree, createWorld } from '../../src/sim/world'
import { executeAction } from '../../src/sim/actions'

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
})
