import { BUILDING_COSTS, recipesFor } from '../sim/machines'
import type { Entity, EntityId, EntityType, ItemKind, SimState, TileRef } from '../sim/types'
import { entitiesAt, getEntity, inBounds } from '../sim/world'
import type { Camera } from '../render/camera'
import { screenToTile } from '../render/camera'

export interface HoverInfo {
  /** Call once per frame: re-reads whatever is under the last known mouse position, since a
   * hovered entity (a blueprint gaining a delivery, a machine finishing a craft) can change even
   * while the mouse itself hasn't moved. */
  update(): void
  destroy(): void
}

/** Preference order when several entities share a tile (a crop and the player standing on it, an
 * item dropped where a bot stands) — the more specific/actionable entity wins. */
const HOVER_PRIORITY: EntityType[] = [
  'bot',
  'blueprint',
  'stockpile',
  'benchSaw',
  'mill',
  'tree',
  'rock',
  'wheat',
  'seedling',
  'tilledSoil',
  'soil',
  'log',
  'stone',
  'plank',
  'block',
  'grain',
  'flour',
  'gear',
  'circuit',
  'core',
  'player',
]

/** "benchSaw" -> "Bench Saw", "tilledSoil" -> "Tilled Soil", "log" -> "Log". */
export function formatLabel(type: string): string {
  const spaced = type.replace(/([A-Z])/g, ' $1')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function pickHoveredEntity(state: SimState, tile: TileRef): Entity | undefined {
  const candidates = entitiesAt(state, tile.x, tile.y)
  for (const type of HOVER_PRIORITY) {
    const match = candidates.find((entity) => entity.type === type)
    if (match !== undefined) {
      return match
    }
  }
  return candidates[0]
}

/** What a blueprint still needs, one line per required item: delivered so far vs. the full cost. */
function describeBlueprint(entity: Entity): string[] {
  if (entity.blueprintOf === null) {
    return []
  }
  const cost = BUILDING_COSTS[entity.blueprintOf]
  return (Object.entries(cost) as [ItemKind, number][]).map(
    ([item, needed]) => `${formatLabel(item)}: ${entity.storage?.[item] ?? 0}/${needed}`,
  )
}

/** A machine's or container's held items, plus its crafting countdown if it's mid-recipe. */
function describeStorage(state: SimState, entity: Entity): string[] {
  if (entity.storage === null) {
    return []
  }
  const storage = entity.storage
  const contents = (Object.entries(storage) as [ItemKind, number][]).filter(([, count]) => count > 0)
  const lines = [contents.length === 0 ? 'Empty' : contents.map(([item, count]) => `${formatLabel(item)}: ${count}`).join(', ')]
  if (entity.craftingUntilTick !== null && entity.craftingOutput !== null) {
    lines.push(`Crafting ${formatLabel(entity.craftingOutput)} (${Math.max(0, entity.craftingUntilTick - state.tick)} ticks left)`)
  }
  return lines
}

function describeBot(state: SimState, entity: Entity): string[] {
  const runtime = state.botRuntimes[entity.id]
  if (runtime === undefined) {
    return []
  }
  const program = state.programs[runtime.programId]
  const status = runtime.blockedReason === undefined ? runtime.status : `${runtime.status} (${runtime.blockedReason})`
  return [`Program: ${program?.name ?? runtime.programId}`, `Status: ${status}`]
}

/** The tooltip's lines for whatever is under the cursor: a title, plus type-specific detail. */
export function describeEntity(state: SimState, entity: Entity): string[] {
  if (entity.type === 'blueprint' && entity.blueprintOf !== null) {
    return [`${formatLabel(entity.blueprintOf)} blueprint`, ...describeBlueprint(entity)]
  }
  const title = formatLabel(entity.type)
  if (entity.type === 'bot') {
    return [title, ...describeBot(state, entity)]
  }
  if (recipesFor(entity.type) !== null || entity.type === 'stockpile') {
    return [title, ...describeStorage(state, entity)]
  }
  if (entity.type === 'seedling' && entity.craftingUntilTick !== null) {
    return [title, `Growing (${Math.max(0, entity.craftingUntilTick - state.tick)} ticks left)`]
  }
  return [title]
}

export function createHoverInfo(canvas: HTMLCanvasElement, container: HTMLElement, state: SimState, camera: Camera, playerId: EntityId): HoverInfo {
  let lastClient: { x: number; y: number } | null = null

  const box = document.createElement('div')
  box.className = 'hover-info'
  box.hidden = true
  container.append(box)

  function onMouseMove(event: MouseEvent): void {
    lastClient = { x: event.clientX, y: event.clientY }
  }

  function onMouseLeave(): void {
    lastClient = null
  }

  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mouseleave', onMouseLeave)

  function refresh(): void {
    if (lastClient === null) {
      box.hidden = true
      return
    }
    const player = getEntity(state, playerId)
    if (player === undefined) {
      box.hidden = true
      return
    }
    const rect = canvas.getBoundingClientRect()
    const clientX = lastClient.x
    const clientY = lastClient.y
    const tile = screenToTile(camera, player.pos.x, player.pos.y, clientX - rect.left, clientY - rect.top)
    if (!inBounds(state, tile)) {
      box.hidden = true
      return
    }
    const entity = pickHoveredEntity(state, tile)
    if (entity === undefined) {
      box.hidden = true
      return
    }

    box.hidden = false
    box.textContent = describeEntity(state, entity).join('\n')

    const offset = 16
    let left = clientX + offset
    let top = clientY + offset
    const boxRect = box.getBoundingClientRect()
    if (left + boxRect.width > window.innerWidth) {
      left = clientX - offset - boxRect.width
    }
    if (top + boxRect.height > window.innerHeight) {
      top = clientY - offset - boxRect.height
    }
    box.style.left = `${Math.max(0, left)}px`
    box.style.top = `${Math.max(0, top)}px`
  }

  return {
    update(): void {
      refresh()
    },
    destroy(): void {
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseleave', onMouseLeave)
      box.remove()
    },
  }
}
