import type { BuildableType } from '../sim/actions'
import { executeAction } from '../sim/actions'
import { generalise } from '../sim/generalise'
import type { Instruction } from '../sim/program'
import { appendInstructions } from '../sim/program'
import type { Recorder } from '../sim/recorder'
import { buildRecordedProgram } from '../sim/recorder'
import type { EntityId, SimState } from '../sim/types'
import { getEntity } from '../sim/world'
import { createBuildMenu } from './BuildMenu'
import { createGeneraliseReview } from './GeneraliseReview'

export interface Toolbar {
  /** Returns the currently armed build choice and clears it, or null if none is armed. */
  takePendingBuild(): BuildableType | null
  /** Refreshes the held-item display. Call once per frame. */
  update(): void
  destroy(): void
  /** True while a recording session, started from some bot's own script editor, is in progress. */
  isRecording(): boolean
  /** Which bot a running recording will be appended to on stop, or null while not recording.
   * Lets a script editor other than the one that started the recording tell that it's running
   * elsewhere, so its own Record button can disable itself instead of silently stealing it. */
  recordingTargetBotId(): EntityId | null
  /**
   * Starts a recording targeted at an existing bot — always from that bot's own script editor,
   * teaching it a job. Stopping splices the finished program onto the end of the bot's existing
   * one (see program.ts's appendInstructions) via EDIT_PROGRAM: free, immediate, and additive,
   * since the bot already exists (built from a blueprint, materials and all) and may already have
   * a job.
   */
  startRecordingForBot(botId: EntityId): void
  /** Stops whatever recording is currently running. */
  stopRecording(): void
}

export function createToolbar(container: HTMLElement, state: SimState, playerId: EntityId, recorder: Recorder): Toolbar {
  let pending: BuildableType | null = null
  let recordedProgramCount = 0
  let generaliseIdCounter = 0
  /** The bot a running recording will be appended to; null while nothing is recording. */
  let recordingTargetBotId: EntityId | null = null
  /** The recorded-onto bot's program exactly as it stood the moment this recording session
   * began — before any of this session's raw, live-appended instructions (see
   * appendLiveInstruction). finishRecording() rebuilds the final program from this snapshot plus
   * the generalised result, rather than appending the generalised result onto whatever the bot's
   * program has grown to *now*, which would duplicate the raw tail already sitting there live. */
  let recordingBaseInstructions: Instruction[] | null = null

  const review = createGeneraliseReview(container)

  const toolbarEl = document.createElement('div')
  toolbarEl.className = 'toolbar'
  container.append(toolbarEl)

  const heldLabel = document.createElement('span')
  toolbarEl.append(heldLabel)

  function programInstructionsFor(botId: EntityId): Instruction[] {
    const runtime = state.botRuntimes[botId]
    const program = runtime === undefined ? undefined : state.programs[runtime.programId]
    return program?.instructions ?? []
  }

  /** Splices one freshly captured instruction straight onto the target bot's live program, so its
   * script editor panel visibly grows in real time while recording — matching the game's fiction
   * that this is the bot's own memory being written to as the player demonstrates the job. Still
   * raw (absolute-tile, ungeneralised): generalise() needs the whole captured sequence at once —
   * lookahead to classify a renewable-resource chain, wrap the lot in REPEAT forever — so it can't
   * run per-instruction. finishRecording() replaces this raw tail wholesale with the generalised,
   * reviewed result once the player assigns it; until then, the raw version standing in as the
   * bot's memory is itself a real, working program, just less portable than the finished one. */
  function appendLiveInstruction(targetBotId: EntityId, instruction: Instruction): void {
    const merged = appendInstructions(programInstructionsFor(targetBotId), [instruction])
    executeAction(state, targetBotId, { op: 'EDIT_PROGRAM', botId: targetBotId, instructions: merged })
  }

  function beginRecording(targetBotId: EntityId): void {
    recordingTargetBotId = targetBotId
    recordingBaseInstructions = programInstructionsFor(targetBotId)
    recorder.start((instruction) => appendLiveInstruction(targetBotId, instruction))
  }

  /** Generalises whatever was captured (wrapping it in REPEAT forever along the way) and shows it
   * for review before splicing it onto the end of the recorded-onto bot's pre-recording program —
   * replacing the raw tail appendLiveInstruction already wrote live, not appending on top of it. */
  function finishRecording(): void {
    const targetBotId = recordingTargetBotId
    const baseInstructions = recordingBaseInstructions
    recordingTargetBotId = null
    recordingBaseInstructions = null
    const instructions = recorder.stop()
    const targetTypes = recorder.lastTargetTypes()
    if (targetBotId === null || instructions.length === 0) {
      return
    }
    recordedProgramCount += 1
    const rawProgram = buildRecordedProgram(`recorded-${recordedProgramCount}`, `Recorded ${recordedProgramCount}`, instructions)
    const { program, changes } = generalise(rawProgram, targetTypes, () => {
      generaliseIdCounter += 1
      return `gen-${recordedProgramCount}-${generaliseIdCounter}`
    })
    review.open(program.instructions, changes, (finalInstructions) => {
      const merged = appendInstructions(baseInstructions ?? [], finalInstructions)
      return executeAction(state, targetBotId, { op: 'EDIT_PROGRAM', botId: targetBotId, instructions: merged })
    })
  }

  const buildMenu = createBuildMenu(toolbarEl, {
    onSelect(choice) {
      pending = pending === choice ? null : choice
      buildMenu.render(pending)
    },
  })
  buildMenu.render(pending)

  return {
    takePendingBuild(): BuildableType | null {
      const choice = pending
      pending = null
      buildMenu.render(pending)
      return choice
    },
    update(): void {
      const player = getEntity(state, playerId)
      const held = player === undefined || player.held === null ? 'nothing' : player.held
      heldLabel.textContent = `Holding: ${held}`
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
      buildMenu.destroy()
      toolbarEl.remove()
      review.destroy()
    },
  }
}
