import { getTile } from '../sim/world'
import { ITEM_KINDS } from '../sim/entities'
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
  // state.entities is always already in ascending id order (addEntity appends, removeEntity
  // filters, neither reorders), so no sort is needed here.
  if (state.entities.length === 0) {
    lines.push('  (none)')
  } else {
    state.entities.forEach((entity, index) => {
      const moveTarget =
        entity.moveTarget === null ? 'none' : `(${entity.moveTarget.x},${entity.moveTarget.y})`
      const held = entity.held === null ? 'none' : entity.held
      let extra = ''
      if (entity.storage !== null) {
        const storage = entity.storage
        const contents = ITEM_KINDS.filter((kind) => (storage[kind] ?? 0) > 0)
          .map((kind) => `${kind}=${storage[kind]}`)
          .join(',')
        extra += ` storage=${contents === '' ? 'empty' : contents}`
      }
      if (entity.type === 'benchSaw' || entity.type === 'mill') {
        extra +=
          entity.craftingUntilTick === null
            ? ' crafting=idle'
            : ` crafting=until-tick-${entity.craftingUntilTick}(${entity.craftingOutput ?? '?'})`
      }
      if (entity.type === 'blueprint') {
        extra += ` blueprintOf=${entity.blueprintOf ?? '?'}`
      }
      lines.push(
        `  ${index + 1}. id=${entity.id} type=${entity.type} pos=(${entity.pos.x},${entity.pos.y}) moveTarget=${moveTarget} held=${held}${extra}`,
      )
    })
  }

  lines.push('bots:')
  const botIds = Object.keys(state.botRuntimes)
    .map(Number)
    .sort((a, b) => a - b)
  if (botIds.length === 0) {
    lines.push('  (none)')
  } else {
    botIds.forEach((id, index) => {
      const runtime = state.botRuntimes[id]
      if (runtime === undefined) {
        return
      }
      const program = state.programs[runtime.programId]
      const programName = program === undefined ? runtime.programId : program.name
      const path = runtime.frames.map((frame) => frame.index).join('.')
      const blockedReason = runtime.blockedReason === undefined ? '' : ` blockedReason=${runtime.blockedReason}`
      lines.push(
        `  ${index + 1}. bot=${id} program=${programName} path=${path} status=${runtime.status}${blockedReason}`,
      )
    })
  }

  return lines.join('\n')
}
