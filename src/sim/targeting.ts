import type { TargetRef } from './program'
import type { Entity, EntityId, EntityType, ItemKind, SimState, TileRef } from './types'
import { entitiesAt, getEntity, inBounds } from './world'

export type ResolvedTarget =
  | { kind: 'entity'; id: EntityId; pos: TileRef }
  | { kind: 'tile'; tile: TileRef }
  | { kind: 'item'; item: ItemKind }

function manhattan(a: TileRef, b: TileRef): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

/** Nearest entity of `entityType` to `from`, ties broken by lowest id. Entities are visited in id order. */
function findNearest(
  state: SimState,
  from: TileRef,
  entityType: EntityType,
  isEligible: (entity: Entity) => boolean,
): Entity | null {
  let best: Entity | null = null
  let bestDistance = Infinity
  const sorted = [...state.entities].sort((a, b) => a.id - b.id)
  for (const entity of sorted) {
    if (entity.type !== entityType || !isEligible(entity)) {
      continue
    }
    const distance = manhattan(from, entity.pos)
    if (distance < bestDistance) {
      best = entity
      bestDistance = distance
    }
  }
  return best
}

function entityTarget(entity: Entity): ResolvedTarget {
  return { kind: 'entity', id: entity.id, pos: { ...entity.pos } }
}

/** Resolves a TargetRef against current world state. Returns null when nothing satisfies it. */
export function resolveTarget(
  state: SimState,
  actorId: EntityId,
  ref: TargetRef,
  lastResult: ResolvedTarget | null,
): ResolvedTarget | null {
  const actor = getEntity(state, actorId)
  if (actor === undefined) {
    return null
  }

  switch (ref.mode) {
    case 'absolute':
      return inBounds(state, ref.tile) ? { kind: 'tile', tile: { ...ref.tile } } : null

    case 'nearestOf': {
      const radius = ref.radius
      const entity = findNearest(
        state,
        actor.pos,
        ref.entityType,
        (candidate) => radius === undefined || manhattan(actor.pos, candidate.pos) <= radius,
      )
      return entity === null ? null : entityTarget(entity)
    }

    case 'inArea': {
      const area = state.areas[ref.areaId]
      if (area === undefined) {
        return null
      }
      const areaTiles = new Set(area.map((tile) => `${tile.x},${tile.y}`))
      const entity = findNearest(state, actor.pos, ref.entityType, (candidate) =>
        areaTiles.has(`${candidate.pos.x},${candidate.pos.y}`),
      )
      return entity === null ? null : entityTarget(entity)
    }

    case 'held':
      return actor.held === null ? null : { kind: 'item', item: actor.held }

    case 'lastResult':
      return lastResult

    case 'marker': {
      const tile = state.markers[ref.markerId]
      return tile === undefined ? null : { kind: 'tile', tile: { ...tile } }
    }
  }
}

/**
 * An `absolute`/`marker` binding resolves to a tile (e.g. "that exact chest"'s location), not the
 * chest itself, so ops that need an entity (USE, PICK_UP, GIVE_TO, TAKE_FROM, and container
 * conditions) look one up at that tile matching `isMatch`. A `nearestOf`/`inArea` binding already
 * resolved straight to an entity.
 */
export function resolveEntityTarget(state: SimState, resolved: ResolvedTarget, isMatch: (entity: Entity) => boolean): EntityId | null {
  if (resolved.kind === 'entity') {
    return resolved.id
  }
  if (resolved.kind === 'tile') {
    const entity = entitiesAt(state, resolved.tile.x, resolved.tile.y).find(isMatch)
    return entity === undefined ? null : entity.id
  }
  return null
}
