import { describe, expect, it } from 'vitest'
import { addRock, addTree, createWorld } from '../../src/sim/world'
import { findPath, findPathAdjacentTo, isAdjacent } from '../../src/sim/pathfind'

describe('pathfind', () => {
  it('finds a direct path across open ground', () => {
    const state = createWorld(5, 5, 1)

    const path = findPath(state, { x: 0, y: 0 }, { x: 2, y: 0 })

    expect(path).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ])
  })

  it('returns an empty path when already at the destination', () => {
    const state = createWorld(5, 5, 1)

    expect(findPath(state, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([])
  })

  it('returns null when the destination is blocked', () => {
    const state = createWorld(5, 5, 1)
    addTree(state, 2, 2)

    expect(findPath(state, { x: 0, y: 0 }, { x: 2, y: 2 })).toBeNull()
  })

  it('routes around a blocking entity', () => {
    const state = createWorld(5, 5, 1)
    // Wall off column x=1 except a gap at y=3, so the path must detour through it.
    addTree(state, 1, 0)
    addTree(state, 1, 1)
    addTree(state, 1, 2)
    addTree(state, 1, 4)

    const path = findPath(state, { x: 0, y: 2 }, { x: 2, y: 2 })

    expect(path).not.toBeNull()
    expect(path?.some((tile) => tile.x === 1 && tile.y === 3)).toBe(true)
  })

  it('finds a path to a tile adjacent to an unwalkable target', () => {
    const state = createWorld(5, 5, 1)
    addRock(state, 2, 2)

    const path = findPathAdjacentTo(state, { x: 0, y: 2 }, { x: 2, y: 2 })

    expect(path).not.toBeNull()
    const destination = path?.at(-1)
    expect(destination).toBeDefined()
    if (destination !== undefined) {
      expect(isAdjacent(destination, { x: 2, y: 2 })).toBe(true)
    }
  })

  it('returns an empty path when already adjacent to the target', () => {
    const state = createWorld(5, 5, 1)
    addRock(state, 2, 2)

    expect(findPathAdjacentTo(state, { x: 1, y: 2 }, { x: 2, y: 2 })).toEqual([])
  })

  it('returns null when a target has no reachable adjacent tile', () => {
    const state = createWorld(3, 3, 1)
    addRock(state, 1, 1)
    addTree(state, 0, 1)
    addTree(state, 2, 1)
    addTree(state, 1, 0)
    addTree(state, 1, 2)

    expect(findPathAdjacentTo(state, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull()
  })
})

describe('isAdjacent', () => {
  it('is true only for orthogonal neighbours', () => {
    expect(isAdjacent({ x: 1, y: 1 }, { x: 1, y: 2 })).toBe(true)
    expect(isAdjacent({ x: 1, y: 1 }, { x: 2, y: 1 })).toBe(true)
    expect(isAdjacent({ x: 1, y: 1 }, { x: 2, y: 2 })).toBe(false)
    expect(isAdjacent({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(false)
  })
})
