import { describe, expect, it } from 'vitest'
import { BUILDING_COSTS, createBlueprint } from '../../src/sim/machines'
import type { Program } from '../../src/sim/program'
import { tick } from '../../src/sim/tick'
import type { SimState } from '../../src/sim/types'
import { createBotRuntime } from '../../src/sim/vm'
import { addBot, addEntity, addStockpile, createWorld, getEntity } from '../../src/sim/world'

function runTicks(state: SimState, count: number): void {
  for (let i = 0; i < count; i += 1) {
    tick(state)
  }
}

/**
 * The M10 acceptance criterion: a hand-written REPEAT-forever delivery routine -- the exact shape
 * a recorded TAKE_FROM -> MOVE_TO -> GIVE_TO sequence would take once wrapped in REPEAT forever --
 * finishes an untouched blueprint unattended, then looks confused and retries rather than erroring
 * once there's no blueprint left to deliver to.
 */
describe('blueprint delivery', () => {
  it('a bot on a REPEAT-forever delivery routine completes an untouched blueprint unattended', () => {
    const state = createWorld(12, 12, 1)
    const botId = addBot(state, 5, 5)
    const stockpileId = addStockpile(state, 5, 2)
    const stockpile = getEntity(state, stockpileId)
    if (stockpile === undefined) {
      throw new Error('stockpile missing')
    }
    const plankCost = BUILDING_COSTS.stockpile.plank ?? 0
    // One plank more than the blueprint needs, so the routine attempts a delivery after it completes.
    stockpile.storage = { plank: plankCost + 1 }
    const blueprintId = addEntity(state, createBlueprint('stockpile', { x: 5, y: 8 }))

    const program: Program = {
      id: 'deliver-planks',
      name: 'deliver planks',
      version: 1,
      instructions: [
        {
          id: 'outer',
          op: 'REPEAT',
          args: [],
          params: { mode: 'forever' },
          children: [
            { id: 'move-to-stockpile', op: 'MOVE_TO', args: [{ mode: 'nearestOf', entityType: 'stockpile' }] },
            { id: 'take', op: 'TAKE_FROM', args: [{ mode: 'nearestOf', entityType: 'stockpile' }], item: 'plank' },
            { id: 'move-to-blueprint', op: 'MOVE_TO', args: [{ mode: 'nearestOf', entityType: 'blueprint' }] },
            { id: 'give', op: 'GIVE_TO', args: [{ mode: 'nearestOf', entityType: 'blueprint' }] },
          ],
        },
      ],
    }
    state.programs[program.id] = program
    state.botRuntimes[botId] = createBotRuntime(program.id, program, 'wait', 'mk2')

    expect(() => runTicks(state, 1500)).not.toThrow()

    const finished = getEntity(state, blueprintId)
    expect(finished?.type).toBe('stockpile')
    expect(finished?.blueprintOf).toBeNull()
    expect(state.entities.some((entity) => entity.type === 'blueprint')).toBe(false)

    // No blueprint left to deliver to (or nothing left to draw from) -- the bot must look
    // confused and retry, never halt or throw.
    expect(state.botRuntimes[botId]?.status).not.toBe('halted')
  })
})
