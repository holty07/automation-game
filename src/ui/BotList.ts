import type { EntityId, SimState } from '../sim/types'

export interface BotList {
  /** Call once per frame: refreshes bot statuses and the current selection. */
  update(): void
  destroy(): void
}

export function createBotList(container: HTMLElement, state: SimState, onSelect: (botId: EntityId) => void): BotList {
  let selectedId: EntityId | null = null
  // Rows persist across frames — replacing them every frame would detach whatever the player (or
  // a test) is mid-click on, since update() runs once per animation frame.
  const rows = new Map<EntityId, HTMLButtonElement>()

  const panel = document.createElement('div')
  panel.className = 'bot-list'
  container.append(panel)

  const heading = document.createElement('div')
  heading.textContent = 'Bots'
  panel.append(heading)

  const list = document.createElement('div')
  panel.append(list)

  function makeRow(botId: EntityId): HTMLButtonElement {
    const row = document.createElement('button')
    row.className = 'bot-list-row'
    row.addEventListener('click', () => {
      selectedId = botId
      onSelect(botId)
      refresh()
    })
    return row
  }

  function refresh(): void {
    const bots = state.entities.filter((entity) => entity.type === 'bot').sort((a, b) => a.id - b.id)
    const liveIds = new Set(bots.map((bot) => bot.id))
    for (const [id, row] of rows) {
      if (!liveIds.has(id)) {
        row.remove()
        rows.delete(id)
      }
    }
    for (const bot of bots) {
      let row = rows.get(bot.id)
      if (row === undefined) {
        row = makeRow(bot.id)
        rows.set(bot.id, row)
        list.append(row)
      }
      const runtime = state.botRuntimes[bot.id]
      const status = runtime === undefined ? 'idle' : runtime.status
      row.textContent = `Bot ${bot.id} — ${status}`
      row.classList.toggle('selected', bot.id === selectedId)
    }
  }

  refresh()

  return {
    update(): void {
      refresh()
    },
    destroy(): void {
      panel.remove()
    },
  }
}
