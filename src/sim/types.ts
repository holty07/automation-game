import type { Rng } from './rng'
import type { Program } from './program'
import type { Routine } from './routines'
import type { BotRuntime } from './vm'

export type TileType = 'grass' | 'dirt' | 'stone' | 'water'

/** An item that can be carried in hand, dropped, and picked back up. */
export type ItemKind = 'log' | 'stone' | 'plank' | 'block' | 'grain' | 'flour' | 'gear' | 'circuit' | 'core' | 'pickaxe' | 'sapling'

export type EntityType =
  | 'player'
  | 'bot'
  | 'tree'
  | 'rock'
  | 'stoneDeposit'
  | 'youngTree'
  | 'stockpile'
  | 'benchSaw'
  | 'mill'
  | 'blueprint'
  | 'soil'
  | 'tilledSoil'
  | 'seedling'
  | 'wheat'
  | ItemKind

/** Things the player can place on an empty tile, via a blueprint — buildings, plus a new bot,
 * which starts with an empty program once its blueprint is fully stocked (see machines.ts's
 * stepBlueprints). */
export type BuildableType = 'stockpile' | 'benchSaw' | 'mill' | 'bot'

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
  /** Typed item store. Non-null only for containers, machines (stockpile, benchSaw, mill) and
   * blueprints (which store delivered materials, not a finished output). */
  storage: Partial<Record<ItemKind, number>> | null
  /** Tick at which a machine's current recipe finishes, or a seedling's growth completes. Null
   * when idle, not timed, or not applicable to this entity's type. */
  craftingUntilTick: number | null
  /** The item a machine's in-progress recipe will deposit into storage once craftingUntilTick
   * elapses. Null for non-machines (including a growing seedling, which is timed but has no
   * storage output — it is replaced by a wheat entity instead; see stepCrops). */
  craftingOutput: ItemKind | null
  /** Tick at which the current craftingUntilTick timer was started. craftingUntilTick alone only
   * says when a timed process is *due*; this is what makes "how much has elapsed" computable, so a
   * progress indicator can be drawn for any of them (crafting, chopping/mining, growth) without
   * needing to know each one's total duration by any other means. Null whenever craftingUntilTick
   * is (kept in lockstep with it: set together, cleared together). */
  craftingStartedTick: number | null
  /** What a `blueprint` entity will become once its storage covers BUILDING_COSTS for this type
   * (see machines.ts's stepBlueprints). Null for every other entity type. */
  blueprintOf: BuildableType | null
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
  /** The program library, keyed by program id. Each is a running or once-run bot's own instructions. */
  programs: Record<string, Program>
  /** The named routine library, keyed by routine id — saved from a bot's program, assignable to any
   * bot, and runnable inline from any bot via the CALL opcode. */
  routines: Record<string, Routine>
  /** Bot VM state, keyed by the bot entity's id. */
  botRuntimes: Record<EntityId, BotRuntime>
}
