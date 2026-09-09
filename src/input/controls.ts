import type { EntityId, ItemKind, SimState, TileRef } from '../sim/types'
import type { ActionRequest } from '../sim/actions'
import { executeAction } from '../sim/actions'
import { isItemKind, ITEM_KINDS } from '../sim/entities'
import { findPathAdjacentTo } from '../sim/pathfind'
import { entitiesAt, getEntity, inBounds } from '../sim/world'
import type { Camera } from '../render/camera'
import { screenToTile } from '../render/camera'
import type { Toolbar } from '../ui/Toolbar'

interface Direction {
  dx: number
  dy: number
}

const DIRECTION_KEYS: Record<string, Direction> = {
  KeyW: { dx: 0, dy: -1 },
  ArrowUp: { dx: 0, dy: -1 },
  KeyS: { dx: 0, dy: 1 },
  ArrowDown: { dx: 0, dy: 1 },
  KeyA: { dx: -1, dy: 0 },
  ArrowLeft: { dx: -1, dy: 0 },
  KeyD: { dx: 1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
}

export interface Controls {
  /** Call once per animation frame to apply any held direction keys. */
  update(): void
  /** Removes all attached DOM listeners. */
  destroy(): void
}

/** The first item kind found in a container's store, in a fixed, deterministic order. */
function firstAvailableItemKind(entity: { storage: Partial<Record<ItemKind, number>> | null }): ItemKind | null {
  if (entity.storage === null) {
    return null
  }
  return ITEM_KINDS.find((kind) => (entity.storage?.[kind] ?? 0) > 0) ?? null
}

export function createControls(
  canvas: HTMLCanvasElement,
  state: SimState,
  camera: Camera,
  playerId: EntityId,
  toolbar: Toolbar,
): Controls {
  const pressed = new Set<string>()
  /** An action queued to fire once the player finishes walking to it (a click on a distant target). */
  let pendingIntent: ActionRequest | null = null

  function onKeyDown(event: KeyboardEvent): void {
    if (event.code in DIRECTION_KEYS) {
      pressed.add(event.code)
    }
  }

  function onKeyUp(event: KeyboardEvent): void {
    pressed.delete(event.code)
  }

  /** Walks the player to `destination` and fires `intent` on arrival, or immediately if already there. */
  function approach(destination: TileRef, intent: ActionRequest): void {
    const player = getEntity(state, playerId)
    if (player === undefined) {
      return
    }
    if (player.pos.x === destination.x && player.pos.y === destination.y) {
      pendingIntent = null
      executeAction(state, playerId, intent)
      return
    }
    const moveResult = executeAction(state, playerId, { op: 'MOVE_TO', target: destination })
    // Only queue the follow-up if the walk actually started — otherwise it would fire
    // next frame from the player's current (wrong) position.
    pendingIntent = moveResult.ok ? intent : null
  }

  function onClick(event: MouseEvent): void {
    const player = getEntity(state, playerId)
    if (player === undefined) {
      return
    }
    const rect = canvas.getBoundingClientRect()
    const tile = screenToTile(
      camera,
      player.pos.x,
      player.pos.y,
      event.clientX - rect.left,
      event.clientY - rect.top,
    )
    if (!inBounds(state, tile)) {
      return
    }

    const pendingBuild = toolbar.takePendingBuild()
    if (pendingBuild !== null) {
      const path = findPathAdjacentTo(state, player.pos, tile)
      if (path === null) {
        return
      }
      const destination = path.length === 0 ? player.pos : path[path.length - 1]
      if (destination === undefined) {
        return
      }
      approach(destination, { op: 'BUILD', kind: pendingBuild, target: tile })
      return
    }

    const container = entitiesAt(state, tile.x, tile.y).find(
      (entity) => entity.type === 'stockpile' || entity.type === 'benchSaw',
    )
    if (container !== undefined) {
      const path = findPathAdjacentTo(state, player.pos, container.pos)
      if (path === null) {
        return
      }
      const destination = path.length === 0 ? player.pos : path[path.length - 1]
      if (destination === undefined) {
        return
      }
      if (player.held !== null) {
        approach(destination, { op: 'GIVE_TO', target: container.id })
        return
      }
      const kind = firstAvailableItemKind(container)
      if (kind === null) {
        return
      }
      approach(destination, { op: 'TAKE_FROM', target: container.id, item: kind })
      return
    }

    const resource = entitiesAt(state, tile.x, tile.y).find(
      (entity) => entity.type === 'tree' || entity.type === 'rock',
    )
    if (resource !== undefined) {
      const path = findPathAdjacentTo(state, player.pos, resource.pos)
      if (path === null) {
        return
      }
      const destination = path.length === 0 ? player.pos : path[path.length - 1]
      if (destination === undefined) {
        return
      }
      approach(destination, { op: 'USE', target: resource.id })
      return
    }

    const item = entitiesAt(state, tile.x, tile.y).find((entity) => isItemKind(entity.type))
    if (item !== undefined && player.held === null) {
      approach(tile, { op: 'PICK_UP', target: item.id })
      return
    }

    if (player.held !== null) {
      approach(tile, { op: 'DROP', target: tile })
      return
    }

    pendingIntent = null
    executeAction(state, playerId, { op: 'MOVE_TO', target: tile })
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('click', onClick)

  return {
    update(): void {
      if (pendingIntent !== null) {
        const player = getEntity(state, playerId)
        if (player !== undefined && player.moveTarget === null && player.path.length === 0) {
          const intent = pendingIntent
          pendingIntent = null
          executeAction(state, playerId, intent)
        }
      }

      if (pressed.size === 0) {
        return
      }
      const player = getEntity(state, playerId)
      if (player === undefined) {
        return
      }
      let dx = 0
      let dy = 0
      for (const code of pressed) {
        const direction = DIRECTION_KEYS[code]
        if (direction === undefined) {
          continue
        }
        dx += direction.dx
        dy += direction.dy
      }
      dx = Math.sign(dx)
      dy = Math.sign(dy)
      if (dx === 0 && dy === 0) {
        return
      }
      pendingIntent = null
      executeAction(state, playerId, { op: 'MOVE_TO', target: { x: player.pos.x + dx, y: player.pos.y + dy } })
    },
    destroy(): void {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('click', onClick)
    },
  }
}
