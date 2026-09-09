import type { Rng } from './rng'
import type { Program } from './program'
import type { BotRuntime } from './vm'

export type TileType = 'grass' | 'dirt' | 'stone' | 'water'

/** An item that can be carried in hand, dropped, and picked back up. */
export type ItemKind = 'log' | 'stone' | 'plank'

export type EntityType = 'player' | 'bot' | 'tree' | 'rock' | 'stockpile' | 'benchSaw' | ItemKind

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
  /** Typed item store. Non-null only for containers and machines (stockpile, benchSaw). */
  storage: Partial<Record<ItemKind, number>> | null
  /** Tick at which a machine's current recipe finishes. Null when idle or not a machine. */
  craftingUntilTick: number | null
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
  /** Player-painted zones, keyed by area id, used by the `inArea` target binding. */
  areas: Record<string, TileRef[]>
  /** Player-stamped named locations, keyed by marker id, used by the `marker` target binding. */
  markers: Record<string, TileRef>
  /** The program library, keyed by program id. */
  programs: Record<string, Program>
  /** Bot VM state, keyed by the bot entity's id. */
  botRuntimes: Record<EntityId, BotRuntime>
}
