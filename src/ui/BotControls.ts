import type { BotTier } from '../sim/program'
import type { Routine } from '../sim/routines'
import type { EntityId } from '../sim/types'

/** Tier select, save-as-routine, assign-routine and copy-to-bot — the M8 "scale" controls for
 * whichever bot ScriptEditor currently has open. A pure DOM-builder like InstructionRow: the
 * caller owns which bot is selected and turns callbacks into `executeAction` calls. */
export interface BotControlsCallbacks {
  onTierChange(tier: BotTier): void
  onSaveRoutine(name: string): void
  onAssignRoutine(routineId: string): void
  onCopyProgram(toBotId: EntityId): void
}

export interface BotControls {
  /** Refreshes the tier value and the routine/bot option lists. Call whenever the open bot's
   * program, tier or the routine library might have changed. */
  render(tier: BotTier, routines: Routine[], otherBotIds: EntityId[]): void
  destroy(): void
}

const TIERS: readonly BotTier[] = ['mk1', 'mk2', 'mk3', 'mk4']

/** Rebuilds a select's options from scratch, keeping the previous selection if it still exists. */
function refreshOptions(select: HTMLSelectElement, options: { value: string; label: string }[]): void {
  const previous = select.value
  select.textContent = ''
  for (const option of options) {
    const entry = document.createElement('option')
    entry.value = option.value
    entry.textContent = option.label
    select.append(entry)
  }
  if (options.some((option) => option.value === previous)) {
    select.value = previous
  }
}

export function createBotControls(container: HTMLElement, callbacks: BotControlsCallbacks): BotControls {
  const panel = document.createElement('div')
  panel.className = 'bot-controls'
  container.append(panel)

  const tierSelect = document.createElement('select')
  tierSelect.setAttribute('aria-label', 'bot tier')
  for (const tier of TIERS) {
    const option = document.createElement('option')
    option.value = tier
    option.textContent = tier
    tierSelect.append(option)
  }
  tierSelect.addEventListener('change', () => callbacks.onTierChange(tierSelect.value as BotTier))

  const routineNameInput = document.createElement('input')
  routineNameInput.type = 'text'
  routineNameInput.placeholder = 'Routine name'
  routineNameInput.setAttribute('aria-label', 'routine name')

  const saveRoutineButton = document.createElement('button')
  saveRoutineButton.textContent = 'Save as routine'
  saveRoutineButton.addEventListener('click', () => {
    const name = routineNameInput.value.trim()
    if (name === '') {
      return
    }
    callbacks.onSaveRoutine(name)
    routineNameInput.value = ''
  })

  const assignSelect = document.createElement('select')
  assignSelect.setAttribute('aria-label', 'routine to assign')

  const assignButton = document.createElement('button')
  assignButton.textContent = 'Assign routine'
  assignButton.addEventListener('click', () => {
    if (assignSelect.value !== '') {
      callbacks.onAssignRoutine(assignSelect.value)
    }
  })

  const copyTargetSelect = document.createElement('select')
  copyTargetSelect.setAttribute('aria-label', 'bot to copy program to')

  const copyButton = document.createElement('button')
  copyButton.textContent = 'Copy program to bot'
  copyButton.addEventListener('click', () => {
    const toBotId = Number(copyTargetSelect.value)
    if (!Number.isNaN(toBotId)) {
      callbacks.onCopyProgram(toBotId)
    }
  })

  panel.append(tierSelect, routineNameInput, saveRoutineButton, assignSelect, assignButton, copyTargetSelect, copyButton)

  return {
    render(tier, routines, otherBotIds): void {
      tierSelect.value = tier
      refreshOptions(
        assignSelect,
        routines.map((routine) => ({ value: routine.id, label: routine.name })),
      )
      refreshOptions(
        copyTargetSelect,
        otherBotIds.map((botId) => ({ value: String(botId), label: `Bot ${botId}` })),
      )
    },
    destroy(): void {
      panel.remove()
    },
  }
}
