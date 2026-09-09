import { describe, expect, it } from 'vitest'
import { addGroundItem, addPlayer, addRock, addTree, createWorld } from '../../src/sim/world'
import { resolveTarget } from '../../src/sim/targeting'
import type { ResolvedTarget } from '../../src/sim/targeting'

describe('resolveTarget', () => {
  it('resolves absolute to the given tile when in bounds', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 0, 0)

    const resolved = resolveTarget(state, playerId, { mode: 'absolute', tile: { x: 3, y: 4 } }, null)

    expect(resolved).toEqual({ kind: 'tile', tile: { x: 3, y: 4 } })
  })

  it('fails absolute when the tile is out of bounds', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 0, 0)

    expect(resolveTarget(state, playerId, { mode: 'absolute', tile: { x: 9, y: 9 } }, null)).toBeNull()
  })

  it('resolves nearestOf to the closest entity of that type', () => {
    const state = createWorld(10, 10, 1)
    const playerId = addPlayer(state, 5, 5)
    addTree(state, 5, 1) // distance 4 — further away
    const nearTreeId = addTree(state, 5, 3) // distance 2 — nearest

    const resolved = resolveTarget(state, playerId, { mode: 'nearestOf', entityType: 'tree' }, null)

    expect(resolved).toEqual({ kind: 'entity', id: nearTreeId, pos: { x: 5, y: 3 } })
  })

  it('breaks nearestOf distance ties by lowest entity id', () => {
    const state = createWorld(10, 10, 1)
    const playerId = addPlayer(state, 5, 5)
    // Both trees are distance 2 from the player: the lower id (added first) should win.
    const firstTreeId = addTree(state, 5, 3)
    const secondTreeId = addTree(state, 3, 5)
    expect(secondTreeId).toBeGreaterThan(firstTreeId)

    const resolved = resolveTarget(state, playerId, { mode: 'nearestOf', entityType: 'tree' }, null)

    expect(resolved).toEqual({ kind: 'entity', id: firstTreeId, pos: { x: 5, y: 3 } })
  })

  it('respects the nearestOf radius', () => {
    const state = createWorld(10, 10, 1)
    const playerId = addPlayer(state, 5, 5)
    addTree(state, 9, 9)

    expect(resolveTarget(state, playerId, { mode: 'nearestOf', entityType: 'tree', radius: 2 }, null)).toBeNull()
    expect(resolveTarget(state, playerId, { mode: 'nearestOf', entityType: 'tree', radius: 20 }, null)).not.toBeNull()
  })

  it('fails nearestOf when nothing of that type exists', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 0, 0)

    expect(resolveTarget(state, playerId, { mode: 'nearestOf', entityType: 'rock' }, null)).toBeNull()
  })

  it('resolves inArea to the nearest entity of that type inside the named area', () => {
    const state = createWorld(10, 10, 1)
    const playerId = addPlayer(state, 0, 0)
    addRock(state, 1, 0) // outside the area
    const insideRockId = addRock(state, 8, 8)
    state.areas['zone'] = [{ x: 8, y: 8 }, { x: 8, y: 9 }]

    const resolved = resolveTarget(state, playerId, { mode: 'inArea', entityType: 'rock', areaId: 'zone' }, null)

    expect(resolved).toEqual({ kind: 'entity', id: insideRockId, pos: { x: 8, y: 8 } })
  })

  it('fails inArea for an unknown area id', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 0, 0)

    expect(resolveTarget(state, playerId, { mode: 'inArea', entityType: 'rock', areaId: 'nope' }, null)).toBeNull()
  })

  it('resolves held to the actor held item, or null when empty-handed', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 0, 0)
    const logId = addGroundItem(state, 'log', 0, 0)

    expect(resolveTarget(state, playerId, { mode: 'held' }, null)).toBeNull()

    const player = state.entities.find((entity) => entity.id === playerId)
    if (player === undefined) {
      throw new Error('expected player entity')
    }
    player.held = 'log'
    void logId

    expect(resolveTarget(state, playerId, { mode: 'held' }, null)).toEqual({ kind: 'item', item: 'log' })
  })

  it('resolves lastResult to whatever was passed in', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 0, 0)
    const previous: ResolvedTarget = { kind: 'tile', tile: { x: 2, y: 2 } }

    expect(resolveTarget(state, playerId, { mode: 'lastResult' }, previous)).toEqual(previous)
    expect(resolveTarget(state, playerId, { mode: 'lastResult' }, null)).toBeNull()
  })

  it('resolves marker to the stamped tile, or null if the marker does not exist', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 0, 0)
    state.markers['home'] = { x: 1, y: 2 }

    expect(resolveTarget(state, playerId, { mode: 'marker', markerId: 'home' }, null)).toEqual({
      kind: 'tile',
      tile: { x: 1, y: 2 },
    })
    expect(resolveTarget(state, playerId, { mode: 'marker', markerId: 'away' }, null)).toBeNull()
  })

  it('fails when the actor does not exist', () => {
    const state = createWorld(5, 5, 1)

    expect(resolveTarget(state, 999, { mode: 'absolute', tile: { x: 0, y: 0 } }, null)).toBeNull()
  })
})
