import type { GeneraliseChange } from '../sim/generalise'
import { undoGeneraliseChange } from '../sim/generalise'
import type { Instruction } from '../sim/program'

export interface GeneraliseReview {
  /** Shows the generalised instructions and their changes; `onAssign` fires with whatever
   * instructions remain once the player has undone any changes they don't want. */
  open(instructions: Instruction[], changes: GeneraliseChange[], onAssign: (instructions: Instruction[]) => void): void
  destroy(): void
}

/** The one-line summary + per-change undo list shown after recording stops, before a program is
 * actually assigned to a bot — see generalise.ts for the transforms this is reviewing. */
export function createGeneraliseReview(container: HTMLElement): GeneraliseReview {
  let instructions: Instruction[] = []
  let pendingChanges: GeneraliseChange[] = []
  let onAssign: ((instructions: Instruction[]) => void) | null = null

  const panel = document.createElement('div')
  panel.className = 'generalise-review'
  panel.hidden = true
  container.append(panel)

  const summary = document.createElement('div')
  summary.className = 'generalise-summary'
  panel.append(summary)

  const list = document.createElement('div')
  list.className = 'generalise-changes'
  panel.append(list)

  const assignButton = document.createElement('button')
  assignButton.textContent = 'Assign to bot'
  assignButton.addEventListener('click', () => {
    const assign = onAssign
    const finalInstructions = instructions
    close()
    assign?.(finalInstructions)
  })
  panel.append(assignButton)

  function render(): void {
    summary.textContent = pendingChanges.length === 0 ? 'No changes made.' : `${pendingChanges.length} change(s) made:`
    list.textContent = ''
    for (const change of pendingChanges) {
      const row = document.createElement('div')
      row.className = 'generalise-change-row'

      const label = document.createElement('span')
      label.textContent = change.description
      row.append(label)

      const undoButton = document.createElement('button')
      undoButton.textContent = 'Undo'
      undoButton.addEventListener('click', () => {
        instructions = undoGeneraliseChange(instructions, change)
        pendingChanges = pendingChanges.filter((pending) => pending.id !== change.id)
        render()
      })
      row.append(undoButton)

      list.append(row)
    }
  }

  function close(): void {
    panel.hidden = true
    onAssign = null
  }

  return {
    open(nextInstructions, changes, assign): void {
      instructions = nextInstructions
      pendingChanges = changes
      onAssign = assign
      panel.hidden = false
      render()
    },
    destroy(): void {
      panel.remove()
    },
  }
}
