import { executeAction } from '../sim/actions'
import type { Instruction, Program } from '../sim/program'
import { countScriptInstructions, instructionCap } from '../sim/program'
import type { EntityId, SimState } from '../sim/types'
import { currentInstructionId } from '../sim/vm'
import type { InstructionRowCallbacks } from './InstructionRow'
import { createInstructionRow } from './InstructionRow'
import { duplicateInstruction, flattenForDisplay, moveInstruction, removeInstruction, updateInstruction } from './instructionTree'

export interface ScriptEditor {
  /** Opens the panel for `botId`, replacing whatever bot was previously focused. */
  open(botId: EntityId): void
  close(): void
  /** Call once per frame: refreshes the live execution highlight and status line. */
  update(): void
  destroy(): void
}

/** Bot tiers arrive in M8; until then every bot is treated as mk1 for the instruction cap. */
const CURRENT_TIER = 'mk1'

export function createScriptEditor(container: HTMLElement, state: SimState): ScriptEditor {
  let openBotId: EntityId | null = null
  let duplicateCounter = 0

  const panel = document.createElement('div')
  panel.className = 'script-editor'
  panel.hidden = true
  container.append(panel)

  const header = document.createElement('div')
  header.className = 'script-editor-header'
  panel.append(header)

  const title = document.createElement('strong')
  const statusLine = document.createElement('span')
  statusLine.className = 'bot-status'
  const closeButton = document.createElement('button')
  closeButton.textContent = 'Close'
  closeButton.addEventListener('click', () => close())
  header.append(title, statusLine, closeButton)

  const counter = document.createElement('div')
  counter.className = 'instruction-counter'
  panel.append(counter)

  const list = document.createElement('div')
  list.className = 'instruction-list'
  panel.append(list)

  function currentProgram(): Program | null {
    if (openBotId === null) {
      return null
    }
    const runtime = state.botRuntimes[openBotId]
    if (runtime === undefined) {
      return null
    }
    return state.programs[runtime.programId] ?? null
  }

  function applyEdit(instructions: Instruction[]): void {
    if (openBotId === null) {
      return
    }
    executeAction(state, openBotId, { op: 'EDIT_PROGRAM', botId: openBotId, instructions })
    render()
  }

  function withProgram(edit: (instructions: Instruction[]) => Instruction[] | null): void {
    const program = currentProgram()
    if (program === null) {
      return
    }
    const result = edit(program.instructions)
    if (result !== null) {
      applyEdit(result)
    }
  }

  function instructionCounterText(program: Program): { text: string; overCap: boolean } {
    const count = countScriptInstructions(program)
    const cap = instructionCap(CURRENT_TIER)
    return { text: `${count} / ${cap} instructions`, overCap: count > cap }
  }

  const callbacks: InstructionRowCallbacks = {
    onDelete(id) {
      withProgram((instructions) => removeInstruction(instructions, id)?.root ?? null)
    },
    onDuplicate(id) {
      withProgram((instructions) =>
        duplicateInstruction(instructions, id, () => {
          duplicateCounter += 1
          return `dup-${duplicateCounter}`
        }),
      )
    },
    onArgChange(id, ref) {
      withProgram((instructions) => updateInstruction(instructions, id, (instruction) => ({ ...instruction, args: [ref] })))
    },
    onItemChange(id, item) {
      withProgram((instructions) => updateInstruction(instructions, id, (instruction) => ({ ...instruction, item })))
    },
    onRepeatParamsChange(id, params) {
      withProgram((instructions) => updateInstruction(instructions, id, (instruction) => ({ ...instruction, params })))
    },
    onMove(sourceId, targetId, position) {
      withProgram((instructions) => moveInstruction(instructions, sourceId, targetId, position))
    },
  }

  function close(): void {
    openBotId = null
    panel.hidden = true
  }

  function render(): void {
    if (openBotId === null) {
      return
    }
    const runtime = state.botRuntimes[openBotId]
    const program = currentProgram()
    if (runtime === undefined || program === null) {
      close()
      return
    }

    title.textContent = `Bot ${openBotId} — ${program.name}`

    const { text, overCap } = instructionCounterText(program)
    counter.textContent = text
    counter.classList.toggle('over-cap', overCap)

    list.textContent = ''
    const activeId = currentInstructionId(runtime)
    for (const row of flattenForDisplay(program.instructions)) {
      list.append(createInstructionRow(row, row.instruction.id === activeId, callbacks))
    }
  }

  return {
    open(botId): void {
      openBotId = botId
      panel.hidden = false
      render()
    },
    close,
    update(): void {
      if (openBotId === null) {
        return
      }
      const runtime = state.botRuntimes[openBotId]
      if (runtime === undefined) {
        close()
        return
      }
      const activeId = currentInstructionId(runtime)
      for (const row of Array.from(list.children)) {
        if (row instanceof HTMLElement) {
          row.classList.toggle('instruction-row-active', row.dataset.instructionId === activeId)
        }
      }
      statusLine.textContent =
        runtime.blockedReason === undefined ? runtime.status : `${runtime.status} — ${runtime.blockedReason}`
    },
    destroy(): void {
      panel.remove()
    },
  }
}
