import { getTile } from '../sim/world'
import type { SimState, TileType } from '../sim/types'

function tileChar(tile: TileType): string {
  switch (tile) {
    case 'grass':
      return '.'
    case 'dirt':
      return ','
    case 'stone':
      return '#'
    case 'water':
      return '~'
  }
}

export function textDump(state: SimState): string {
  const lines: string[] = []

  lines.push(`tick: ${state.tick}`)

  lines.push('grid:')
  for (let y = 0; y < state.height; y += 1) {
    let row = ''
    for (let x = 0; x < state.width; x += 1) {
      row += tileChar(getTile(state, x, y))
    }
    lines.push(row)
  }

  lines.push('entities:')
  const sorted = [...state.entities].sort((a, b) => a.id - b.id)
  if (sorted.length === 0) {
    lines.push('  (none)')
  } else {
    sorted.forEach((entity, index) => {
      lines.push(`  ${index + 1}. id=${entity.id} type=${entity.type} pos=(${entity.pos.x},${entity.pos.y})`)
    })
  }

  lines.push('bots:')
  lines.push('  (none)')

  return lines.join('\n')
}
