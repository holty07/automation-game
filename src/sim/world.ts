import type { Entity, EntityId, ItemKind, SimState, TileRef, TileType } from './types'
import { createRng } from './rng'
import { MOVE_TICKS_PER_TILE } from './movement'
import { createGroundItem, createRock, createTree, staticEntity } from './entities'
import { createBenchSaw, createStockpile } from './machines'

const DEFAULT_TILE: TileType = 'grass'

/** Entity types that occupy their tile exclusively — nothing else can walk onto or path through it. */
const BLOCKING_TYPES = new Set(['tree', 'rock', 'stockpile', 'benchSaw'])

export function createWorld(width: number, height: number, seed: number): SimState {
  return {
    width,
    height,
    tiles: new Array<TileType>(width * height).fill(DEFAULT_TILE),
    entities: [],
    nextEntityId: 0,
    tick: 0,
    seed,
    rng: createRng(seed),
    areas: {},
    markers: {},
    programs: {},
    botRuntimes: {},
  }
}

function tileIndex(state: SimState, x: number, y: number): number {
  if (x < 0 || x >= state.width || y < 0 || y >= state.height) {
    throw new Error(`Tile out of bounds: (${x}, ${y})`)
  }
  return y * state.width + x
}

export function getTile(state: SimState, x: number, y: number): TileType {
  const tile = state.tiles[tileIndex(state, x, y)]
  if (tile === undefined) {
    throw new Error(`Tile out of bounds: (${x}, ${y})`)
  }
  return tile
}

export function setTile(state: SimState, x: number, y: number, tile: TileType): void {
  state.tiles[tileIndex(state, x, y)] = tile
}

export function addEntity(state: SimState, entity: Omit<Entity, 'id'>): EntityId {
  const id = state.nextEntityId
  state.nextEntityId += 1
  state.entities.push({ ...entity, id })
  return id
}

export function removeEntity(state: SimState, id: EntityId): void {
  state.entities = state.entities.filter((entity) => entity.id !== id)
}

export function entitiesAt(state: SimState, x: number, y: number): Entity[] {
  return state.entities.filter((entity) => entity.pos.x === x && entity.pos.y === y)
}

export function getEntity(state: SimState, id: EntityId): Entity | undefined {
  return state.entities.find((entity) => entity.id === id)
}

export function addPlayer(state: SimState, x: number, y: number): EntityId {
  return addEntity(state, {
    type: 'player',
    pos: { x, y },
    prevPos: { x, y },
    moveTarget: null,
    moveCooldown: MOVE_TICKS_PER_TILE - 1,
    path: [],
    held: null,
    busyUntilTick: 0,
    storage: null,
    craftingUntilTick: null,
  })
}

export function addTree(state: SimState, x: number, y: number): EntityId {
  return addEntity(state, createTree({ x, y }))
}

export function addRock(state: SimState, x: number, y: number): EntityId {
  return addEntity(state, createRock({ x, y }))
}

export function addGroundItem(state: SimState, kind: ItemKind, x: number, y: number): EntityId {
  return addEntity(state, createGroundItem(kind, { x, y }))
}

export function addStockpile(state: SimState, x: number, y: number): EntityId {
  return addEntity(state, createStockpile({ x, y }))
}

export function addBenchSaw(state: SimState, x: number, y: number): EntityId {
  return addEntity(state, createBenchSaw({ x, y }))
}

export function addBot(state: SimState, x: number, y: number): EntityId {
  return addEntity(state, staticEntity('bot', { x, y }))
}

export function inBounds(state: SimState, tile: TileRef): boolean {
  return tile.x >= 0 && tile.x < state.width && tile.y >= 0 && tile.y < state.height
}

/** Whether an actor could stand on this tile — in bounds and not occupied by a blocking entity. */
export function isWalkable(state: SimState, tile: TileRef): boolean {
  if (!inBounds(state, tile)) {
    return false
  }
  return !entitiesAt(state, tile.x, tile.y).some((entity) => BLOCKING_TYPES.has(entity.type))
}
