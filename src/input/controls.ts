import type { EntityId, ItemKind, SimState, TileRef } from '../sim/types'
import type { ActionRequest, BuildableType } from '../sim/actions'
import { isActorBusy } from '../sim/actions'
import { isItemKind, ITEM_KINDS } from '../sim/entities'
import { findPathAdjacentTo } from '../sim/pathfind'
import type { Recorder } from '../sim/recorder'
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
  recorder: Recorder,
  openBot: (botId: EntityId) => void,
): Controls {
  const pressed = new Set<string>()
  /** An action queued to fire once the player finishes walking to it (a click on a distant target). */
  let pendingIntent: ActionRequest | null = null
  /** A click that arrived while the player was busy (mid-action cooldown, or already mid-walk from
   * an earlier click) — resolved from update() the moment the player is free, exactly as if the
   * click had just landed then. Without this, a click during a busy window (e.g. right after
   * chopping a tree, while the swing's cooldown is still running) would resolve immediately,
   * fail the busy check deep in executeAction, and be silently dropped — the player would have to
   * notice nothing happened and click again. A later click while one is already pending replaces
   * it outright: the same "last click wins" rule `approach()` already applies to `pendingIntent` —
   * which is exactly why storing one here also clears any live `pendingIntent`: without that, a
   * click landing mid-walk (busy via moveTarget, not a cooldown) would leave the *previous* click's
   * queued follow-up action intact, and it would fire once the walk finishes — reviving a stale
   * action the player had already clicked past, instead of redirecting to what they clicked next. */
  let pendingClick: { tile: TileRef; pendingBuild: BuildableType | null } | null = null

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
      recorder.perform(state, playerId, intent)
      return
    }
    const moveResult = recorder.perform(state, playerId, { op: 'MOVE_TO', target: destination })
    // Only queue the follow-up if the walk actually started — otherwise it would fire
    // next frame from the player's current (wrong) position.
    pendingIntent = moveResult.ok ? intent : null
  }

  /** Everything a click actually does once the player is free to act on it — armed-build
   * placement, opening a bot, container give/take, item pick-up, resource use, planting, dropping,
   * or a plain walk. Runs either straight from onClick (player already free) or later from
   * update() (the click arrived while busy and was deferred as pendingClick). `pendingBuild` is
   * taken from the toolbar at the moment of the original click, not re-read here, so a deferred
   * build placement still reflects what was actually armed when the player clicked. */
  function resolveClick(tile: TileRef, pendingBuild: BuildableType | null): void {
    const player = getEntity(state, playerId)
    if (player === undefined) {
      return
    }

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

    // Clicking a bot always opens its script, the same as clicking it in the bot list — recording
    // onto it goes through the Record button in that panel now, not a click on the world itself.
    const bot = entitiesAt(state, tile.x, tile.y).find((entity) => entity.type === 'bot')
    if (bot !== undefined) {
      openBot(bot.id)
      return
    }

    const container = entitiesAt(state, tile.x, tile.y).find(
      (entity) => entity.type === 'stockpile' || entity.type === 'benchSaw' || entity.type === 'mill' || entity.type === 'blueprint',
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

    // Checked before resources: a persistent renewable resource (a stone deposit, tilled soil just
    // left behind by a harvest) can share its tile with the item it just produced, and a resource
    // is always still there to re-match on the next click — so if a loose item sits here and hands
    // are free, grabbing it takes priority, or clicking that tile could never pick anything up.
    const item = entitiesAt(state, tile.x, tile.y).find((entity) => isItemKind(entity.type))
    if (item !== undefined && player.held === null) {
      approach(tile, { op: 'PICK_UP', target: item.id })
      return
    }

    const resource = entitiesAt(state, tile.x, tile.y).find(
      (entity) =>
        entity.type === 'tree' ||
        entity.type === 'rock' ||
        entity.type === 'stoneDeposit' ||
        entity.type === 'soil' ||
        entity.type === 'tilledSoil' ||
        entity.type === 'wheat',
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

    if (player.held === 'sapling' && entitiesAt(state, tile.x, tile.y).length === 0) {
      const path = findPathAdjacentTo(state, player.pos, tile)
      if (path === null) {
        return
      }
      const destination = path.length === 0 ? player.pos : path[path.length - 1]
      if (destination === undefined) {
        return
      }
      approach(destination, { op: 'PLANT', target: tile })
      return
    }

    if (player.held !== null) {
      approach(tile, { op: 'DROP', target: tile })
      return
    }

    pendingIntent = null
    recorder.perform(state, playerId, { op: 'MOVE_TO', target: tile })
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

    // Taken now, not at resolve time, so a build stays armed-then-consumed at the moment the
    // player actually clicked, even if resolving it has to wait for them to stop being busy.
    const pendingBuild = toolbar.takePendingBuild()

    if (isActorBusy(state, player)) {
      pendingIntent = null
      pendingClick = { tile, pendingBuild }
      return
    }
    resolveClick(tile, pendingBuild)
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
          recorder.perform(state, playerId, intent)
        }
      }

      if (pendingClick !== null) {
        const player = getEntity(state, playerId)
        if (player !== undefined && !isActorBusy(state, player)) {
          const { tile, pendingBuild } = pendingClick
          pendingClick = null
          resolveClick(tile, pendingBuild)
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
      recorder.perform(state, playerId, { op: 'MOVE_TO', target: { x: player.pos.x + dx, y: player.pos.y + dy } })
    },
    destroy(): void {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('click', onClick)
    },
  }
}
