import type { Entity, SimState, TileRef } from './types'

/** Ticks a moving entity spends on each tile at fixed walking speed (20 ticks/sec). */
export const MOVE_TICKS_PER_TILE = 4

function samePos(a: TileRef, b: TileRef): boolean {
  return a.x === b.x && a.y === b.y
}

/** Arrival at moveTarget: continue onto the next queued waypoint, if any, otherwise stop. */
function advanceToNextWaypoint(entity: Entity): void {
  const next = entity.path.shift()
  entity.moveTarget = next === undefined ? null : next
}

function stepEntity(state: SimState, entity: Entity): void {
  if (entity.moveTarget === null) {
    return
  }

  if (samePos(entity.pos, entity.moveTarget)) {
    advanceToNextWaypoint(entity)
    return
  }

  if (entity.moveCooldown > 0) {
    entity.moveCooldown -= 1
    return
  }

  const dx = Math.sign(entity.moveTarget.x - entity.pos.x)
  const dy = dx === 0 ? Math.sign(entity.moveTarget.y - entity.pos.y) : 0

  entity.prevPos = { ...entity.pos }
  entity.pos = { x: entity.pos.x + dx, y: entity.pos.y + dy }
  entity.moveCooldown = MOVE_TICKS_PER_TILE - 1

  if (samePos(entity.pos, entity.moveTarget)) {
    advanceToNextWaypoint(entity)
  }
}

/** Advances every entity one movement tick towards its move target, in stable id order. */
export function stepMovement(state: SimState): void {
  const sorted = [...state.entities].sort((a, b) => a.id - b.id)
  for (const entity of sorted) {
    stepEntity(state, entity)
  }
}
