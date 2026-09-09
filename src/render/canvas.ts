import type { Entity, EntityId, SimState } from '../sim/types'
import { getTile } from '../sim/world'
import { MOVE_TICKS_PER_TILE } from '../sim/movement'
import type { Camera } from './camera'
import { lerp, tileToScreen, visibleTileBounds } from './camera'
import { drawEntity, drawTile } from './sprites'

/**
 * An entity's tile position only advances once every MOVE_TICKS_PER_TILE ticks, not every
 * tick. Interpolating prevPos->pos over just the latest tick's alpha would hold the sprite
 * still for most of a step and then snap it across a tile in the final tick — visible
 * stutter. Instead we interpolate pos->moveTarget over the whole multi-tick step, using how
 * many of its ticks have already elapsed (tracked via the cooldown) plus the current alpha.
 */
export function interpolatedPos(entity: Entity, alpha: number): { x: number; y: number } {
  if (entity.moveTarget === null) {
    return entity.pos
  }
  const stepsElapsed = MOVE_TICKS_PER_TILE - 1 - entity.moveCooldown
  const fraction = Math.min(1, Math.max(0, (stepsElapsed + alpha) / MOVE_TICKS_PER_TILE))
  return {
    x: lerp(entity.pos.x, entity.moveTarget.x, fraction),
    y: lerp(entity.pos.y, entity.moveTarget.y, fraction),
  }
}

/** Draws the world and its entities for the given interpolation alpha (0..1 between ticks). */
export function render(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  camera: Camera,
  followEntityId: EntityId,
  alpha: number,
): void {
  const follow = state.entities.find((entity) => entity.id === followEntityId)
  const { x: followX, y: followY } =
    follow === undefined ? { x: state.width / 2, y: state.height / 2 } : interpolatedPos(follow, alpha)

  ctx.clearRect(0, 0, camera.viewportWidth, camera.viewportHeight)

  // Tiles are snapped to whole pixels and drawn 1px oversized so that the fractional
  // camera position (from interpolation) never opens a seam between neighbouring tiles.
  const bounds = visibleTileBounds(camera, followX, followY, state.width, state.height)
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const screen = tileToScreen(camera, followX, followY, x, y)
      drawTile(ctx, getTile(state, x, y), Math.round(screen.x), Math.round(screen.y), camera.tileSize + 1)
    }
  }

  const sorted = [...state.entities].sort((a, b) => a.id - b.id)
  for (const entity of sorted) {
    const { x, y } = interpolatedPos(entity, alpha)
    const screen = tileToScreen(camera, followX, followY, x, y)
    drawEntity(ctx, entity.type, screen.x, screen.y, camera.tileSize)
  }
}
