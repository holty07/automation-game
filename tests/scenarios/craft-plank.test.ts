import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { load } from '../../src/sim/serialise'
import { tick } from '../../src/sim/tick'
import { executeAction } from '../../src/sim/actions'
import { getEntity } from '../../src/sim/world'
import { BENCH_SAW_RECIPES } from '../../src/sim/machines'
import { textDump } from '../../src/debug/textDump'
import type { SimState } from '../../src/sim/types'

const PLANK_RECIPE = BENCH_SAW_RECIPES.log
if (PLANK_RECIPE === undefined) {
  throw new Error('expected recipe missing')
}

function runTicks(state: SimState, count: number): void {
  for (let i = 0; i < count; i += 1) {
    tick(state)
  }
}

describe('hand-crafting a plank', () => {
  it('feeds a bench saw, collects a plank and stores it in a stockpile', () => {
    const json = readFileSync(new URL('../fixtures/craft-plank.json', import.meta.url), 'utf8')
    const state = load(json)
    const playerId = 0
    const benchSawId = 1
    const stockpileId = 2

    // Feed the held log into the bench saw: it starts crafting and the player's hands empty.
    const feedResult = executeAction(state, playerId, { op: 'GIVE_TO', target: benchSawId })
    expect(feedResult.ok).toBe(true)
    expect(getEntity(state, playerId)?.held).toBeNull()
    expect(getEntity(state, benchSawId)?.craftingUntilTick).toBe(state.tick + PLANK_RECIPE.ticks)

    runTicks(state, PLANK_RECIPE.ticks)

    // The recipe has finished: a plank is waiting in the bench saw's output, and it is idle again.
    expect(getEntity(state, benchSawId)?.craftingUntilTick).toBeNull()
    expect(getEntity(state, benchSawId)?.storage).toEqual({ plank: 1 })

    // Collect the plank.
    const collectResult = executeAction(state, playerId, { op: 'TAKE_FROM', target: benchSawId, item: 'plank' })
    expect(collectResult.ok).toBe(true)
    expect(getEntity(state, playerId)?.held).toBe('plank')
    expect(getEntity(state, benchSawId)?.storage).toEqual({ plank: 0 })

    runTicks(state, 8)

    // Store it in the stockpile.
    const storeResult = executeAction(state, playerId, { op: 'GIVE_TO', target: stockpileId })
    expect(storeResult.ok).toBe(true)
    expect(getEntity(state, playerId)?.held).toBeNull()
    expect(getEntity(state, stockpileId)?.storage).toEqual({ plank: 1 })

    const dump = textDump(state)
    expect(dump).toContain('type=stockpile')
    expect(dump).toContain('storage=plank=1')
    expect(dump).toContain('type=benchSaw')
    expect(dump).toContain('crafting=idle')
  })
})
