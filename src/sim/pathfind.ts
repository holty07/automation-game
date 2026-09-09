import type { SimState, TileRef } from './types'
import { isWalkable } from './world'

/** Fixed neighbour visit order so BFS tie-breaking is deterministic: N, E, S, W. */
const NEIGHBOUR_OFFSETS: TileRef[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
]

function tileKey(tile: TileRef): string {
  return `${tile.x},${tile.y}`
}

export function isAdjacent(a: TileRef, b: TileRef): boolean {
  const dx = Math.abs(a.x - b.x)
  const dy = Math.abs(a.y - b.y)
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1)
}

function reconstructPath(goal: TileRef, from: TileRef, parents: Map<string, TileRef>): TileRef[] {
  const path: TileRef[] = []
  let current = goal
  while (current.x !== from.x || current.y !== from.y) {
    path.unshift(current)
    const parent = parents.get(tileKey(current))
    if (parent === undefined) {
      break
    }
    current = parent
  }
  return path
}

function bfs(state: SimState, from: TileRef, isGoal: (tile: TileRef) => boolean): TileRef[] | null {
  if (isGoal(from)) {
    return []
  }

  const parents = new Map<string, TileRef>()
  const visited = new Set<string>([tileKey(from)])
  const queue: TileRef[] = [from]
  let head = 0

  while (head < queue.length) {
    const current = queue[head]
    head += 1
    if (current === undefined) {
      continue
    }
    for (const offset of NEIGHBOUR_OFFSETS) {
      const next = { x: current.x + offset.x, y: current.y + offset.y }
      const key = tileKey(next)
      if (visited.has(key) || !isWalkable(state, next)) {
        continue
      }
      visited.add(key)
      parents.set(key, current)
      if (isGoal(next)) {
        return reconstructPath(next, from, parents)
      }
      queue.push(next)
    }
  }

  return null
}

/** Shortest walkable path from `from` to `to` (excluding `from`), or null if unreachable. */
export function findPath(state: SimState, from: TileRef, to: TileRef): TileRef[] | null {
  return bfs(state, from, (tile) => tile.x === to.x && tile.y === to.y)
}

/** Shortest walkable path from `from` to a tile orthogonally adjacent to `target`, or null if none is reachable. */
export function findPathAdjacentTo(state: SimState, from: TileRef, target: TileRef): TileRef[] | null {
  return bfs(state, from, (tile) => isAdjacent(tile, target))
}
