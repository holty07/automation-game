import type { Rng } from './rng'

export type TileType = 'grass' | 'dirt' | 'stone' | 'water'

export type EntityType = 'player' | 'bot'

export type EntityId = number

export interface TileRef {
  x: number
  y: number
}

export interface Entity {
  id: EntityId
  type: EntityType
  pos: TileRef
  prevPos: TileRef
  moveTarget: TileRef | null
  moveCooldown: number
}

export interface SimState {
  width: number
  height: number
  tiles: TileType[]
  entities: Entity[]
  nextEntityId: EntityId
  tick: number
  seed: number
  rng: Rng
}
