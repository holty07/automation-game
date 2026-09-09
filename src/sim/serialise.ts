import type { Entity, SimState, TileType } from './types'
import { createRng } from './rng'

export const SAVE_VERSION = 1

interface SaveDataV1 {
  version: 1
  width: number
  height: number
  tiles: TileType[]
  entities: Entity[]
  nextEntityId: number
  tick: number
  seed: number
  rngState: number
}

export function save(state: SimState): string {
  const data: SaveDataV1 = {
    version: SAVE_VERSION,
    width: state.width,
    height: state.height,
    tiles: state.tiles,
    entities: state.entities,
    nextEntityId: state.nextEntityId,
    tick: state.tick,
    seed: state.seed,
    rngState: state.rng.state,
  }
  return JSON.stringify(data)
}

export function migrate(raw: unknown): SaveDataV1 {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Save data must be a JSON object.')
  }
  if (!('version' in raw)) {
    throw new Error('Save data is missing a version field.')
  }
  const version = (raw as { version: unknown }).version
  if (version !== SAVE_VERSION) {
    throw new Error(`Unknown save version: ${String(version)}. This build supports version ${SAVE_VERSION}.`)
  }
  return raw as SaveDataV1
}

export function load(json: string): SimState {
  const parsed: unknown = JSON.parse(json)
  const data = migrate(parsed)
  return {
    width: data.width,
    height: data.height,
    tiles: data.tiles,
    entities: data.entities,
    nextEntityId: data.nextEntityId,
    tick: data.tick,
    seed: data.seed,
    rng: createRng(data.rngState),
  }
}
