import type { BuildableType } from '../sim/actions'
import type { EntityId, SimState } from '../sim/types'
import { getEntity } from '../sim/world'

export interface Toolbar {
  /** Returns the currently armed build choice and clears it, or null if none is armed. */
  takePendingBuild(): BuildableType | null
  /** Refreshes the held-item display. Call once per frame. */
  update(): void
  destroy(): void
}

const BUILD_LABELS: Record<BuildableType, string> = {
  stockpile: 'Stockpile',
  benchSaw: 'Bench Saw',
}

export function createToolbar(container: HTMLElement, state: SimState, playerId: EntityId): Toolbar {
  let pending: BuildableType | null = null

  const heldLabel = document.createElement('span')
  container.append(heldLabel)

  const buttons = new Map<BuildableType, HTMLButtonElement>()

  function refreshButtons(): void {
    for (const [choice, button] of buttons) {
      button.textContent = choice === pending ? `Place ${BUILD_LABELS[choice]} (click a tile)` : `Build ${BUILD_LABELS[choice]}`
    }
  }

  function onButtonClick(choice: BuildableType): void {
    pending = pending === choice ? null : choice
    refreshButtons()
  }

  for (const choice of ['stockpile', 'benchSaw'] as const) {
    const button = document.createElement('button')
    button.addEventListener('click', () => onButtonClick(choice))
    buttons.set(choice, button)
    container.append(button)
  }
  refreshButtons()

  return {
    takePendingBuild(): BuildableType | null {
      const choice = pending
      pending = null
      refreshButtons()
      return choice
    },
    update(): void {
      const player = getEntity(state, playerId)
      const held = player === undefined || player.held === null ? 'nothing' : player.held
      heldLabel.textContent = `Holding: ${held}`
    },
    destroy(): void {
      heldLabel.remove()
      for (const button of buttons.values()) {
        button.remove()
      }
    },
  }
}
