import type { Entity, EntityType, ItemKind, TileRef } from './types'

/** What a resource node yields when used: chop a tree for a log, mine a rock for stone. */
export const RESOURCE_YIELD: Record<'tree' | 'rock', ItemKind> = {
  tree: 'log',
  rock: 'stone',
}

export const ITEM_KINDS: ItemKind[] = ['log', 'stone', 'plank']

export function isItemKind(type: EntityType): type is ItemKind {
  return (ITEM_KINDS as EntityType[]).includes(type)
}

/**
 * Opcodes costed here. MOVE_TO is deliberately absent — its duration comes from the
 * continuous per-tile movement system (movement.ts's MOVE_TICKS_PER_TILE), not this table.
 */
export type ActionOp = 'PICK_UP' | 'DROP' | 'USE' | 'GIVE_TO' | 'TAKE_FROM' | 'BUILD'

const ACTION_COSTS: Record<string, number> = {
  'USE:tree': 40,
  'USE:rock': 60,
  'PICK_UP:log': 8,
  'PICK_UP:stone': 8,
  'PICK_UP:plank': 8,
  'DROP:log': 4,
  'DROP:stone': 4,
  'DROP:plank': 4,
  'GIVE_TO:log': 4,
  'GIVE_TO:stone': 4,
  'GIVE_TO:plank': 4,
  'TAKE_FROM:log': 8,
  'TAKE_FROM:stone': 8,
  'TAKE_FROM:plank': 8,
  'BUILD:stockpile': 20,
  'BUILD:benchSaw': 20,
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

export type EntityData = Omit<Entity, 'id'>

export function staticEntity(type: EntityType, pos: TileRef): EntityData {
  return {
    type,
    pos: { ...pos },
    prevPos: { ...pos },
    moveTarget: null,
    moveCooldown: 0,
    path: [],
    held: null,
    busyUntilTick: 0,
    storage: null,
    craftingUntilTick: null,
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
