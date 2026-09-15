import type { Entity, EntityId, SimState } from '../sim/types'
import { getTile } from '../sim/world'
import { MOVE_TICKS_PER_TILE } from '../sim/movement'
import { lockedStockpileItem } from '../sim/machines'
import type { Camera } from './camera'
import { lerp, tileToScreen, visibleTileBounds } from './camera'
import { drawBlueprint, drawCraftingProgress, drawEntity, drawStoredItemBadge, drawTile } from './sprites'

/** How much of *any* timed process has elapsed, 0 (just started) to 1 (due) — a machine crafting,
 * a chop/mine in progress, a seedling or sapling growing. Generic across all of them: `state.tick`
 * against `craftingStartedTick`/`craftingUntilTick`, whatever the entity's type or the process's
 * total duration (which varies per recipe for a machine, so it can't be reconstructed from
 * entity.type alone — this is why craftingStartedTick exists at all). Null (skip drawing) if
 * either field is missing — including a save file from before craftingStartedTick existed, where a
 * mid-craft machine would have craftingUntilTick set but craftingStartedTick absent (`undefined`,
 * not `null`, since it simply isn't in the old JSON) rather than a real start point to measure from. */
export function craftingProgressFraction(state: SimState, entity: Entity): number | null {
  const started = entity.craftingStartedTick
  const until = entity.craftingUntilTick
  if (typeof started !== 'number' || typeof until !== 'number' || until === started) {
    return null
  }
  return (state.tick - started) / (until - started)
}

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

  // state.entities is always already in ascending id order (addEntity appends, removeEntity
  // filters, neither reorders), so no sort is needed on this hot per-frame path.
  for (const entity of state.entities) {
    const { x, y } = interpolatedPos(entity, alpha)
    const screen = tileToScreen(camera, followX, followY, x, y)
    if (entity.type === 'blueprint') {
      drawBlueprint(ctx, entity.blueprintOf, screen.x, screen.y, camera.tileSize)
    } else {
      drawEntity(ctx, entity.type, screen.x, screen.y, camera.tileSize)
    }

    if (entity.type === 'stockpile' && entity.storage !== null) {
      const stored = lockedStockpileItem(entity.storage)
      if (stored !== null) {
        drawStoredItemBadge(ctx, stored, screen.x, screen.y, camera.tileSize)
      }
    }

    const craftingFraction = craftingProgressFraction(state, entity)
    if (craftingFraction !== null) {
      drawCraftingProgress(ctx, craftingFraction, screen.x, screen.y, camera.tileSize)
    }
  }
}
