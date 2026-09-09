import type { Rng } from './rng'

export type TileType = 'grass' | 'dirt' | 'stone' | 'water'

/** An item that can be carried in hand, dropped, and picked back up. */
export type ItemKind = 'log' | 'stone'

export type EntityType = 'player' | 'bot' | 'tree' | 'rock' | ItemKind

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
  /** Remaining waypoints of a multi-tile walk, beyond the current moveTarget. */
  path: TileRef[]
  /** Item currently held in hand. Only meaningful for actors (player, bot). */
  held: ItemKind | null
  /** Tick at which this actor's current timed action finishes. Busy while state.tick is earlier. */
  busyUntilTick: number
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
