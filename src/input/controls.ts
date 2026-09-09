import type { EntityId, SimState } from '../sim/types'
import { setMoveTarget } from '../sim/movement'
import { getEntity } from '../sim/world'
import type { Camera } from '../render/camera'
import { screenToTile } from '../render/camera'

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

export function createControls(
  canvas: HTMLCanvasElement,
  state: SimState,
  camera: Camera,
  playerId: EntityId,
): Controls {
  const pressed = new Set<string>()

  function onKeyDown(event: KeyboardEvent): void {
    if (event.code in DIRECTION_KEYS) {
      pressed.add(event.code)
    }
  }

  function onKeyUp(event: KeyboardEvent): void {
    pressed.delete(event.code)
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
    setMoveTarget(state, playerId, tile)
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('click', onClick)

  return {
    update(): void {
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
      setMoveTarget(state, playerId, { x: player.pos.x + dx, y: player.pos.y + dy })
    },
    destroy(): void {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('click', onClick)
    },
  }
}
