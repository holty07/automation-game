import type { EntityId, SimState } from '../sim/types'
import { getTile } from '../sim/world'
import type { Camera } from './camera'
import { lerp, tileToScreen, visibleTileBounds } from './camera'
import { drawEntity, drawTile } from './sprites'

/** Draws the world and its entities for the given interpolation alpha (0..1 between ticks). */
export function render(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  camera: Camera,
  followEntityId: EntityId,
  alpha: number,
): void {
  const follow = state.entities.find((entity) => entity.id === followEntityId)
  const followX = follow === undefined ? state.width / 2 : lerp(follow.prevPos.x, follow.pos.x, alpha)
  const followY = follow === undefined ? state.height / 2 : lerp(follow.prevPos.y, follow.pos.y, alpha)

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
    const x = lerp(entity.prevPos.x, entity.pos.x, alpha)
    const y = lerp(entity.prevPos.y, entity.pos.y, alpha)
    const screen = tileToScreen(camera, followX, followY, x, y)
    drawEntity(ctx, entity.type, screen.x, screen.y, camera.tileSize)
  }
}
