import type { Entity, EntityId, SimState, TileType } from './types'
import { createRng } from './rng'

const DEFAULT_TILE: TileType = 'grass'

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
