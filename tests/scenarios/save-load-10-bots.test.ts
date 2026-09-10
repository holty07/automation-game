import { describe, expect, it } from 'vitest'
import { executeAction } from '../../src/sim/actions'
import type { Program } from '../../src/sim/program'
import { save, load } from '../../src/sim/serialise'
import { tick } from '../../src/sim/tick'
import type { EntityId, SimState } from '../../src/sim/types'
import { addPlayer, createWorld } from '../../src/sim/world'
import { textDump } from '../../src/debug/textDump'

function moveLoopProgram(id: string, target: { x: number; y: number }): Program {
  return {
    id,
    name: id,
    version: 1,
    instructions: [
      {
        id: `${id}-outer`,
        op: 'REPEAT',
        args: [],
        params: { mode: 'forever' },
        children: [{ id: `${id}-move`, op: 'MOVE_TO', args: [{ mode: 'absolute', tile: target }] }],
      },
    ],
  }
}

function deploy(state: SimState, playerId: EntityId, program: Program): EntityId {
  const result = executeAction(state, playerId, { op: 'DEPLOY_BOT', program })
  if (result.producedEntityId === undefined) {
    throw new Error('DEPLOY_BOT did not produce a bot')
  }
  return result.producedEntityId
}

/** A 16x16 world with a player and 10 bots, exercising every M8 feature at once: bot tiers, the
 * routine library (save/assign), copy-to-bot, and CALL — so a save/load round trip has all of it
 * to preserve, not just plain programs. */
function buildTenBotWorld(): SimState {
  const state = createWorld(16, 16, 7)
  const playerId = addPlayer(state, 8, 8)

  const botIds = Array.from({ length: 10 }, (_, i) => deploy(state, playerId, moveLoopProgram(`prog-${i}`, { x: i, y: 0 })))
  const [bot0, bot1, bot2, bot3, bot4, bot5] = botIds
  if (bot0 === undefined || bot1 === undefined || bot2 === undefined || bot3 === undefined || bot4 === undefined || bot5 === undefined) {
    throw new Error('expected 10 bots')
  }

  executeAction(state, bot0, { op: 'SET_BOT_TIER', botId: bot0, tier: 'mk4' })
  executeAction(state, bot1, { op: 'SET_BOT_TIER', botId: bot1, tier: 'mk2' })

  // The routine library: save bot 2's program, then assign it onto bot 3 as an independent copy.
  executeAction(state, bot2, { op: 'SAVE_ROUTINE', botId: bot2, routineId: 'routine-1', name: 'Shared routine' })
  executeAction(state, bot3, { op: 'ASSIGN_ROUTINE', botId: bot3, routineId: 'routine-1', programId: 'assigned-1' })

  // Copy-to-bot: bot 5 takes on bot 4's program as its own independent copy.
  executeAction(state, bot4, { op: 'COPY_PROGRAM', fromBotId: bot4, toBotId: bot5, programId: 'copied-1' })

  // CALL, mk4-only: bot 0 loops the saved routine inline instead of its own program.
  executeAction(state, bot0, {
    op: 'EDIT_PROGRAM',
    botId: bot0,
    instructions: [
      {
        id: 'call-outer',
        op: 'REPEAT',
        args: [],
        params: { mode: 'forever' },
        children: [{ id: 'call', op: 'CALL', args: [], routineId: 'routine-1' }],
      },
    ],
  })

  return state
}

function runTicks(state: SimState, count: number): void {
  for (let i = 0; i < count; i += 1) {
    tick(state)
  }
}

describe('save/load fidelity with 10 bots', () => {
  it('produces identical text dumps after 200 ticks on the original and a reloaded save', () => {
    const original = buildTenBotWorld()
    const reloaded = load(save(original))

    runTicks(original, 200)
    runTicks(reloaded, 200)

    expect(textDump(reloaded)).toEqual(textDump(original))
  })
})
