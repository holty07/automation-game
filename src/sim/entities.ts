import type { Entity, EntityType, ItemKind, TileRef } from './types'

/** What a resource node yields when used: chop a tree for a log, mine a rock for stone. */
export const RESOURCE_YIELD: Record<'tree' | 'rock', ItemKind> = {
  tree: 'log',
  rock: 'stone',
}

/**
 * Opcodes costed here. MOVE_TO is deliberately absent — its duration comes from the
 * continuous per-tile movement system (movement.ts's MOVE_TICKS_PER_TILE), not this table.
 */
export type ActionOp = 'PICK_UP' | 'DROP' | 'USE'

const ACTION_COSTS: Record<string, number> = {
  'USE:tree': 40,
  'USE:rock': 60,
  'PICK_UP:log': 8,
  'PICK_UP:stone': 8,
  'DROP:log': 4,
  'DROP:stone': 4,
}

/** Looks up a tick duration from the action-cost table. Throws if (op, targetType) is undefined. */
export function getActionCost(op: ActionOp, targetType: string): number {
  const key = `${op}:${targetType}`
  const cost = ACTION_COSTS[key]
  if (cost === undefined) {
    throw new Error(`No action cost defined for ${key}`)
  }
  return cost
}

type EntityData = Omit<Entity, 'id'>

function staticEntity(type: EntityType, pos: TileRef): EntityData {
  return {
    type,
    pos: { ...pos },
    prevPos: { ...pos },
    moveTarget: null,
    moveCooldown: 0,
    path: [],
    held: null,
    busyUntilTick: 0,
  }
}

export function createTree(pos: TileRef): EntityData {
  return staticEntity('tree', pos)
}

export function createRock(pos: TileRef): EntityData {
  return staticEntity('rock', pos)
}

export function createGroundItem(kind: ItemKind, pos: TileRef): EntityData {
  return staticEntity(kind, pos)
}
