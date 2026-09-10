import { BOT_TIER_COSTS, nextTier } from '../sim/botCosts'
import type { BotTier } from '../sim/program'
import type { Routine } from '../sim/routines'
import type { EntityId, ItemKind } from '../sim/types'

export interface UpgradeOutcome {
  ok: boolean
  reason?: string
}

/** Tier upgrade, save-as-routine, assign-routine and copy-to-bot — the M8/M9 "scale" controls for
 * whichever bot ScriptEditor currently has open. A pure DOM-builder like InstructionRow: the
 * caller owns which bot is selected and turns callbacks into `executeAction` calls. */
export interface BotControlsCallbacks {
  /** Costed — the caller reports whether the upgrade actually happened, so a failure (not enough
   * stocked materials) can be shown inline instead of silently doing nothing. */
  onUpgradeTier(): UpgradeOutcome
  onSaveRoutine(name: string): void
  onAssignRoutine(routineId: string): void
  onCopyProgram(toBotId: EntityId): void
}

export interface BotControls {
  /** Refreshes the tier display and the routine/bot option lists. Call whenever the open bot's
   * program, tier or the routine library might have changed. */
  render(tier: BotTier, routines: Routine[], otherBotIds: EntityId[]): void
  destroy(): void
}

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

function costText(cost: Partial<Record<ItemKind, number>>): string {
  return (Object.entries(cost) as [ItemKind, number][]).map(([item, count]) => `${count} ${item}`).join(', ')
}

export function createBotControls(container: HTMLElement, callbacks: BotControlsCallbacks): BotControls {
  const panel = document.createElement('div')
  panel.className = 'bot-controls'
  container.append(panel)

  const tierLabel = document.createElement('span')
  tierLabel.className = 'bot-tier-label'

  const upgradeButton = document.createElement('button')
  upgradeButton.addEventListener('click', () => {
    const outcome = callbacks.onUpgradeTier()
    upgradeError.textContent = outcome.ok ? '' : (outcome.reason ?? 'Could not upgrade.')
  })

  const upgradeError = document.createElement('span')
  upgradeError.className = 'bot-upgrade-error'

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

  panel.append(
    tierLabel,
    upgradeButton,
    upgradeError,
    routineNameInput,
    saveRoutineButton,
    assignSelect,
    assignButton,
    copyTargetSelect,
    copyButton,
  )

  return {
    render(tier, routines, otherBotIds): void {
      tierLabel.textContent = `Tier: ${tier}`
      upgradeError.textContent = ''

      const target = nextTier(tier)
      if (target === null) {
        upgradeButton.hidden = true
      } else {
        upgradeButton.hidden = false
        upgradeButton.textContent = `Upgrade to ${target} (${costText(BOT_TIER_COSTS[target])})`
      }

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
