import type { EntityType, TileType } from '../sim/types'

const TILE_COLOURS: Record<TileType, string> = {
  grass: '#3f7d3a',
  dirt: '#8a6642',
  stone: '#8a8a8a',
  water: '#3468a8',
}

const ENTITY_COLOURS: Record<EntityType, string> = {
  player: '#f2c245',
  bot: '#c2452f',
}

export function drawTile(ctx: CanvasRenderingContext2D, tile: TileType, x: number, y: number, size: number): void {
  ctx.fillStyle = TILE_COLOURS[tile]
  ctx.fillRect(x, y, size, size)
}

export function drawEntity(ctx: CanvasRenderingContext2D, type: EntityType, x: number, y: number, size: number): void {
  const inset = size * 0.15
  const drawn = size - inset * 2
  ctx.fillStyle = ENTITY_COLOURS[type]
  ctx.beginPath()
  ctx.roundRect(x + inset, y + inset, drawn, drawn, drawn * 0.3)
  ctx.fill()
}
