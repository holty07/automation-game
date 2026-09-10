import { executeAction } from '../sim/actions'
import type { BotTier, Instruction, Program } from '../sim/program'
import { countScriptInstructions, instructionCap, isOpcodeAvailable } from '../sim/program'
import type { EntityId, SimState } from '../sim/types'
import type { FailurePolicy } from '../sim/vm'
import { currentInstructionId } from '../sim/vm'
import { createBotControls } from './BotControls'
import type { InstructionRowCallbacks } from './InstructionRow'
import { createInstructionRow } from './InstructionRow'
import {
  appendInstruction,
  duplicateInstruction,
  flattenForDisplay,
  moveInstruction,
  removeInstruction,
  updateInstruction,
} from './instructionTree'

/** Opcodes the "Add instruction" control can insert — the ones a player adds deliberately rather
 * than by recording (WAIT is never recorded; REPEAT/REPEAT_UNTIL/IF/CALL are structure the player
 * builds). Each render() filters this down to whatever the open bot's tier actually unlocks. */
const ADDABLE_OPCODES = ['WAIT', 'IF', 'REPEAT_UNTIL', 'REPEAT', 'CALL'] as const
type AddableOpcode = (typeof ADDABLE_OPCODES)[number]

const FAILURE_POLICIES: readonly FailurePolicy[] = ['wait', 'skip', 'halt']

function defaultInstruction(op: AddableOpcode, id: string): Instruction {
  switch (op) {
    case 'WAIT':
      return { id, op: 'WAIT', args: [], waitTicks: 20 }
    case 'IF':
      return { id, op: 'IF', args: [], condition: { type: 'NOT_HOLDING' }, children: [] }
    case 'REPEAT_UNTIL':
      return { id, op: 'REPEAT_UNTIL', args: [], condition: { type: 'NOT_HOLDING' }, children: [] }
    case 'REPEAT':
      return { id, op: 'REPEAT', args: [], params: { mode: 'forever' }, children: [] }
    case 'CALL':
      return { id, op: 'CALL', args: [], routineId: '' }
  }
}

export interface ScriptEditor {
  /** Opens the panel for `botId`, replacing whatever bot was previously focused. */
  open(botId: EntityId): void
  close(): void
  /** Call once per frame: refreshes the live execution highlight and status line. */
  update(): void
  destroy(): void
}

export function createScriptEditor(container: HTMLElement, state: SimState): ScriptEditor {
  let openBotId: EntityId | null = null
  let duplicateCounter = 0
  let addedCounter = 0
  let routineCounter = 0
  let assignedProgramCounter = 0

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

  const failurePolicySelect = document.createElement('select')
  failurePolicySelect.setAttribute('aria-label', 'failure policy')
  for (const policy of FAILURE_POLICIES) {
    const option = document.createElement('option')
    option.value = policy
    option.textContent = policy
    failurePolicySelect.append(option)
  }
  failurePolicySelect.addEventListener('change', () => {
    if (openBotId === null) {
      return
    }
    executeAction(state, openBotId, {
      op: 'SET_FAILURE_POLICY',
      botId: openBotId,
      policy: failurePolicySelect.value as FailurePolicy,
    })
  })

  const closeButton = document.createElement('button')
  closeButton.textContent = 'Close'
  closeButton.addEventListener('click', () => close())
  header.append(title, statusLine, failurePolicySelect, closeButton)

  const botControls = createBotControls(panel, {
    onTierChange(tier) {
      if (openBotId === null) {
        return
      }
      executeAction(state, openBotId, { op: 'SET_BOT_TIER', botId: openBotId, tier })
      render()
    },
    onSaveRoutine(name) {
      if (openBotId === null) {
        return
      }
      routineCounter += 1
      executeAction(state, openBotId, { op: 'SAVE_ROUTINE', botId: openBotId, routineId: `routine-${routineCounter}`, name })
      render()
    },
    onAssignRoutine(routineId) {
      if (openBotId === null) {
        return
      }
      assignedProgramCounter += 1
      executeAction(state, openBotId, {
        op: 'ASSIGN_ROUTINE',
        botId: openBotId,
        routineId,
        programId: `assigned-${assignedProgramCounter}`,
      })
      render()
    },
    onCopyProgram(toBotId) {
      if (openBotId === null) {
        return
      }
      assignedProgramCounter += 1
      executeAction(state, openBotId, {
        op: 'COPY_PROGRAM',
        fromBotId: openBotId,
        toBotId,
        programId: `copied-${assignedProgramCounter}`,
      })
    },
  })

  const counter = document.createElement('div')
  counter.className = 'instruction-counter'
  panel.append(counter)

  const list = document.createElement('div')
  list.className = 'instruction-list'
  panel.append(list)

  const addRow = document.createElement('div')
  addRow.className = 'add-instruction-row'
  const addSelect = document.createElement('select')
  addSelect.setAttribute('aria-label', 'new instruction opcode')
  const addButton = document.createElement('button')
  addButton.textContent = 'Add instruction'
  addButton.addEventListener('click', () => {
    addedCounter += 1
    const op = addSelect.value as AddableOpcode
    withProgram((instructions) => appendInstruction(instructions, defaultInstruction(op, `added-${addedCounter}`)))
  })
  addRow.append(addSelect, addButton)
  panel.append(addRow)

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

  function instructionCounterText(program: Program, tier: BotTier): { text: string; overCap: boolean } {
    const count = countScriptInstructions(program)
    const cap = instructionCap(tier)
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
    onConditionChange(id, condition) {
      withProgram((instructions) => updateInstruction(instructions, id, (instruction) => ({ ...instruction, condition })))
    },
    onWaitTicksChange(id, ticks) {
      withProgram((instructions) => updateInstruction(instructions, id, (instruction) => ({ ...instruction, waitTicks: ticks })))
    },
    onRoutineIdChange(id, routineId) {
      withProgram((instructions) => updateInstruction(instructions, id, (instruction) => ({ ...instruction, routineId })))
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
    failurePolicySelect.value = runtime.failurePolicy

    const { text, overCap } = instructionCounterText(program, runtime.tier)
    counter.textContent = text
    counter.classList.toggle('over-cap', overCap)

    addSelect.textContent = ''
    for (const op of ADDABLE_OPCODES.filter((candidate) => isOpcodeAvailable(candidate, runtime.tier))) {
      const option = document.createElement('option')
      option.value = op
      option.textContent = op
      addSelect.append(option)
    }

    const otherBotIds = state.entities.filter((entity) => entity.type === 'bot' && entity.id !== openBotId).map((entity) => entity.id)
    botControls.render(runtime.tier, Object.values(state.routines), otherBotIds)

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
      botControls.destroy()
      panel.remove()
    },
  }
}
