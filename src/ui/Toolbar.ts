import type { BuildableType } from '../sim/actions'
import { executeAction } from '../sim/actions'
import { generalise } from '../sim/generalise'
import { appendInstructions } from '../sim/program'
import type { Recorder } from '../sim/recorder'
import { buildRecordedProgram } from '../sim/recorder'
import type { EntityId, SimState } from '../sim/types'
import { getEntity } from '../sim/world'
import { createGeneraliseReview } from './GeneraliseReview'

export interface Toolbar {
  /** Returns the currently armed build choice and clears it, or null if none is armed. */
  takePendingBuild(): BuildableType | null
  /** Refreshes the held-item display. Call once per frame. */
  update(): void
  destroy(): void
  /** True while a recording session (started either way) is in progress. */
  isRecording(): boolean
  /** Which bot (if any) a running recording will be appended to on stop; null while recording
   * targets a brand-new deployed bot instead (the toolbar's own Record button), or while not
   * recording at all. Lets another recording entry point (the script editor's own Record button)
   * tell whether it's the one in control, versus one already running elsewhere. */
  recordingTargetBotId(): EntityId | null
  /**
   * Starts a recording targeted at an existing bot — the script editor's own Record button, for
   * teaching a specific, already-open bot more directly. Unlike the toolbar's own Record button,
   * which always deploys a brand new, materials-costed bot, stopping a bot-targeted recording
   * splices the finished program onto the end of that bot's existing one (see program.ts's
   * appendInstructions) via EDIT_PROGRAM: free, immediate, and additive, since the bot already
   * exists and may already have a job.
   */
  startRecordingForBot(botId: EntityId): void
  /** Stops whatever recording is currently running, however it was started. */
  stopRecording(): void
}

const BUILD_LABELS: Record<BuildableType, string> = {
  stockpile: 'Stockpile',
  benchSaw: 'Bench Saw',
  mill: 'Mill',
}

export function createToolbar(container: HTMLElement, state: SimState, playerId: EntityId, recorder: Recorder): Toolbar {
  let pending: BuildableType | null = null
  let recordedProgramCount = 0
  let generaliseIdCounter = 0
  /** null while recording via the generic Record button (stopping deploys a brand new bot); set
   * while recording was started by clicking a specific bot (stopping edits that bot's program instead). */
  let recordingTargetBotId: EntityId | null = null

  const review = createGeneraliseReview(container)

  const toolbarEl = document.createElement('div')
  toolbarEl.className = 'toolbar'
  container.append(toolbarEl)

  const heldLabel = document.createElement('span')
  toolbarEl.append(heldLabel)

  const recordButton = document.createElement('button')
  /** Disabled (rather than hidden) while a recording is running that this button doesn't control —
   * one targeted at a specific bot, started from that bot's own script editor — so it never looks
   * clickable in a way that would silently steal or clobber that other recording. */
  function refreshRecordButton(): void {
    if (!recorder.recording) {
      recordButton.textContent = 'Record'
      recordButton.disabled = false
      return
    }
    if (recordingTargetBotId === null) {
      recordButton.textContent = 'Stop'
      recordButton.disabled = false
    } else {
      recordButton.textContent = `Recording bot ${recordingTargetBotId}…`
      recordButton.disabled = true
    }
  }

  function beginRecording(targetBotId: EntityId | null): void {
    recordingTargetBotId = targetBotId
    recorder.start()
    refreshRecordButton()
  }

  /** Generalises whatever was captured (wrapping it in REPEAT forever along the way) and shows it
   * for review before handing it off — to a freshly spawned bot (materials-costed) if this
   * recording was started via the generic Record button, or spliced onto the end of the bot that
   * was already selected to record onto (free, immediate, additive) otherwise. */
  function finishRecording(): void {
    const targetBotId = recordingTargetBotId
    recordingTargetBotId = null
    const instructions = recorder.stop()
    const targetTypes = recorder.lastTargetTypes()
    refreshRecordButton()
    if (instructions.length === 0) {
      return
    }
    recordedProgramCount += 1
    const rawProgram = buildRecordedProgram(`recorded-${recordedProgramCount}`, `Recorded ${recordedProgramCount}`, instructions)
    const { program, changes } = generalise(rawProgram, targetTypes, () => {
      generaliseIdCounter += 1
      return `gen-${recordedProgramCount}-${generaliseIdCounter}`
    })
    review.open(program.instructions, changes, (finalInstructions) => {
      if (targetBotId === null) {
        return executeAction(state, playerId, { op: 'DEPLOY_BOT', program: { ...program, instructions: finalInstructions } })
      }
      const targetRuntime = state.botRuntimes[targetBotId]
      const existingProgram = targetRuntime === undefined ? undefined : state.programs[targetRuntime.programId]
      const merged = appendInstructions(existingProgram?.instructions ?? [], finalInstructions)
      return executeAction(state, targetBotId, { op: 'EDIT_PROGRAM', botId: targetBotId, instructions: merged })
    })
  }

  function onRecordClick(): void {
    if (recorder.recording) {
      finishRecording()
      return
    }
    beginRecording(null)
  }
  recordButton.addEventListener('click', onRecordClick)
  refreshRecordButton()
  toolbarEl.append(recordButton)

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

  for (const choice of ['stockpile', 'benchSaw', 'mill'] as const) {
    const button = document.createElement('button')
    button.addEventListener('click', () => onButtonClick(choice))
    buttons.set(choice, button)
    toolbarEl.append(button)
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
      // A recording started or stopped from the script editor's own button changes this button's
      // state too, and vice versa — so both stay in sync regardless of which one is driving.
      refreshRecordButton()
    },
    isRecording(): boolean {
      return recorder.recording
    },
    recordingTargetBotId(): EntityId | null {
      return recordingTargetBotId
    },
    startRecordingForBot(botId: EntityId): void {
      if (recorder.recording) {
        return
      }
      beginRecording(botId)
    },
    stopRecording(): void {
      if (!recorder.recording) {
        return
      }
      finishRecording()
    },
    destroy(): void {
      toolbarEl.remove()
      review.destroy()
    },
  }
}
