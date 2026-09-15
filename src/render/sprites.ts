import type { BuildableType, EntityType, ItemKind, TileType } from '../sim/types'
import { entityImage, tileImage } from './assets'

const TILE_COLOURS: Record<TileType, string> = {
  grass: '#3f7d3a',
  dirt: '#8a6642',
  stone: '#8a8a8a',
  water: '#3468a8',
}

const ENTITY_COLOURS: Record<EntityType, string> = {
  player: '#f2c245',
  bot: '#c2452f',
  tree: '#2d5f34',
  rock: '#6e6e6e',
  stoneDeposit: '#5a5a5a',
  youngTree: '#5a9c4f',
  log: '#8a5a2b',
  stone: '#a8a8a8',
  plank: '#c9a06a',
  block: '#c7c7c7',
  grain: '#d9b23c',
  flour: '#f2e9d8',
  gear: '#9aa5ad',
  circuit: '#3f9e7a',
  core: '#8a4fd1',
  pickaxe: '#b5651d',
  sapling: '#8fd97a',
  stockpile: '#5b4636',
  benchSaw: '#7a5230',
  stoneCutter: '#7d7a72',
  mill: '#6b5b8a',
  blueprint: '#5b8fd1',
  soil: '#6b4a2f',
  tilledSoil: '#4a3520',
  seedling: '#7fbf5f',
  wheat: '#dcc244',
}

export function drawTile(ctx: CanvasRenderingContext2D, tile: TileType, x: number, y: number, size: number): void {
  const image = tileImage(tile)
  if (image !== null) {
    ctx.drawImage(image, x, y, size, size)
    return
  }
  ctx.fillStyle = TILE_COLOURS[tile]
  ctx.fillRect(x, y, size, size)
}

export function drawEntity(ctx: CanvasRenderingContext2D, type: EntityType, x: number, y: number, size: number): void {
  const image = entityImage(type)
  if (image !== null) {
    ctx.drawImage(image, x, y, size, size)
    return
  }
  const inset = size * 0.15
  const drawn = size - inset * 2
  ctx.fillStyle = ENTITY_COLOURS[type]
  ctx.beginPath()
  ctx.roundRect(x + inset, y + inset, drawn, drawn, drawn * 0.3)
  ctx.fill()
}

/** A blueprint's own preview: a dimmed rendering of its *target* sprite (falling back to a
 * dimmed flat-colour square, same shape as drawEntity's placeholder, if that sprite hasn't
 * loaded), so the buildable kinds read differently from one another at a glance — a bot
 * blueprint looks like a faint bot, a mill blueprint a faint mill — without needing dedicated
 * blueprint art. The dashed outline is the "not built yet" cue common to every kind. */
export function drawBlueprint(ctx: CanvasRenderingContext2D, kind: BuildableType | null, x: number, y: number, size: number): void {
  const inset = size * 0.15
  const drawn = size - inset * 2

  ctx.save()
  ctx.globalAlpha = 0.5
  const image = kind === null ? null : entityImage(kind)
  if (image !== null) {
    ctx.drawImage(image, x, y, size, size)
  } else {
    ctx.fillStyle = kind === null ? ENTITY_COLOURS.blueprint : ENTITY_COLOURS[kind]
    ctx.beginPath()
    ctx.roundRect(x + inset, y + inset, drawn, drawn, drawn * 0.3)
    ctx.fill()
  }
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = '#5af'
  ctx.lineWidth = 2
  ctx.setLineDash([4, 3])
  ctx.beginPath()
  ctx.roundRect(x + inset, y + inset, drawn, drawn, drawn * 0.3)
  ctx.stroke()
  ctx.restore()
}

/** A thin fill bar under a tile going through any timed process — a machine crafting, a chop/mine
 * in progress, a seedling or sapling growing — showing how much of it has elapsed so far. The
 * "work is being done" cue that makes an entity staying put and unchanged for a while read as
 * in-progress rather than stuck. `fraction` is 0 at the moment the timer starts and 1 the instant
 * it's due to complete (see canvas.ts's craftingProgressFraction, which derives it generically from
 * craftingStartedTick/craftingUntilTick — no per-entity-type knowledge needed here at all). */
export function drawCraftingProgress(ctx: CanvasRenderingContext2D, fraction: number, x: number, y: number, size: number): void {
  const clamped = Math.min(1, Math.max(0, fraction))
  const barHeight = size * 0.12
  const barWidth = size * 0.8
  const barX = x + size * 0.1
  const barY = y + size - barHeight - size * 0.06

  ctx.fillStyle = '#000a'
  ctx.fillRect(barX, barY, barWidth, barHeight)
  ctx.fillStyle = '#5af'
  ctx.fillRect(barX, barY, barWidth * clamped, barHeight)
}

/** A small badge in a stockpile's corner showing what it currently holds — a stockpile locks to
 * one resource kind at a time (see machines.ts's lockedStockpileItem), so there's always at most
 * one kind to show. Smaller than a full tile and offset into a corner so the stockpile's own
 * sprite/colour underneath stays visible too. */
export function drawStoredItemBadge(ctx: CanvasRenderingContext2D, item: ItemKind, x: number, y: number, size: number): void {
  const badgeSize = size * 0.55
  const offset = size - badgeSize - size * 0.05
  const badgeX = x + offset
  const badgeY = y + offset

  const image = entityImage(item)
  if (image !== null) {
    ctx.drawImage(image, badgeX, badgeY, badgeSize, badgeSize)
    return
  }
  const inset = badgeSize * 0.1
  const drawn = badgeSize - inset * 2
  ctx.fillStyle = ENTITY_COLOURS[item]
  ctx.beginPath()
  ctx.roundRect(badgeX + inset, badgeY + inset, drawn, drawn, drawn * 0.3)
  ctx.fill()
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 1
  ctx.stroke()
}
