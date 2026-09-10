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
  tree: '#2d5f34',
  rock: '#6e6e6e',
  log: '#8a5a2b',
  stone: '#a8a8a8',
  plank: '#c9a06a',
  block: '#c7c7c7',
  grain: '#d9b23c',
  flour: '#f2e9d8',
  gear: '#9aa5ad',
  circuit: '#3f9e7a',
  core: '#8a4fd1',
  stockpile: '#5b4636',
  benchSaw: '#7a5230',
  mill: '#6b5b8a',
  soil: '#6b4a2f',
  tilledSoil: '#4a3520',
  seedling: '#7fbf5f',
  wheat: '#dcc244',
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
