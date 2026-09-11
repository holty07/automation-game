import type { Entity, EntityType, ItemKind, TileRef } from './types'

/** What a resource node yields when used: chop a tree for a log, mine a rock for stone. */
export const RESOURCE_YIELD: Record<'tree' | 'rock', ItemKind> = {
  tree: 'log',
  rock: 'stone',
}

export const ITEM_KINDS: ItemKind[] = ['log', 'stone', 'plank', 'block', 'grain', 'flour', 'gear', 'circuit', 'core']

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
  'USE:soil': 30,
  'USE:tilledSoil': 20,
  'USE:wheat': 30,
  'PICK_UP:log': 8,
  'PICK_UP:stone': 8,
  'PICK_UP:plank': 8,
  'PICK_UP:block': 8,
  'PICK_UP:grain': 8,
  'PICK_UP:flour': 8,
  'PICK_UP:gear': 8,
  'PICK_UP:circuit': 8,
  'PICK_UP:core': 8,
  'DROP:log': 4,
  'DROP:stone': 4,
  'DROP:plank': 4,
  'DROP:block': 4,
  'DROP:grain': 4,
  'DROP:flour': 4,
  'DROP:gear': 4,
  'DROP:circuit': 4,
  'DROP:core': 4,
  'GIVE_TO:log': 4,
  'GIVE_TO:stone': 4,
  'GIVE_TO:plank': 4,
  'GIVE_TO:block': 4,
  'GIVE_TO:grain': 4,
  'GIVE_TO:flour': 4,
  'GIVE_TO:gear': 4,
  'GIVE_TO:circuit': 4,
  'GIVE_TO:core': 4,
  'TAKE_FROM:log': 8,
  'TAKE_FROM:stone': 8,
  'TAKE_FROM:plank': 8,
  'TAKE_FROM:block': 8,
  'TAKE_FROM:grain': 8,
  'TAKE_FROM:flour': 8,
  'TAKE_FROM:gear': 8,
  'TAKE_FROM:circuit': 8,
  'TAKE_FROM:core': 8,
  'BUILD:stockpile': 20,
  'BUILD:benchSaw': 20,
  'BUILD:mill': 20,
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
    craftingOutput: null,
    blueprintOf: null,
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
