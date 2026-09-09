import type { BuildableType } from '../sim/actions'
import { executeAction } from '../sim/actions'
import type { Recorder } from '../sim/recorder'
import { buildRecordedProgram } from '../sim/recorder'
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

export function createToolbar(container: HTMLElement, state: SimState, playerId: EntityId, recorder: Recorder): Toolbar {
  let pending: BuildableType | null = null
  let recordedProgramCount = 0

  const heldLabel = document.createElement('span')
  container.append(heldLabel)

  const recordButton = document.createElement('button')
  function refreshRecordButton(): void {
    recordButton.textContent = recorder.recording ? 'Stop' : 'Record'
  }
  /** On stop: wraps whatever was captured in REPEAT forever and hands it to a freshly spawned bot. */
  function onRecordClick(): void {
    if (recorder.recording) {
      const instructions = recorder.stop()
      refreshRecordButton()
      if (instructions.length === 0) {
        return
      }
      recordedProgramCount += 1
      const program = buildRecordedProgram(`recorded-${recordedProgramCount}`, `Recorded ${recordedProgramCount}`, instructions)
      executeAction(state, playerId, { op: 'DEPLOY_BOT', program })
      return
    }
    recorder.start()
    refreshRecordButton()
  }
  recordButton.addEventListener('click', onRecordClick)
  refreshRecordButton()
  container.append(recordButton)

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
      recordButton.remove()
      for (const button of buttons.values()) {
        button.remove()
      }
    },
  }
}
