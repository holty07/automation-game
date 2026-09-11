import { describe, expect, it } from 'vitest'
import { addBenchSaw, addBot, addGroundItem, addMill, addPlayer, addStockpile, createWorld, getEntity } from '../../src/sim/world'
import { TUTORIAL_HINTS } from '../../src/ui/Tutorial'

function hint(index: number) {
  const found = TUTORIAL_HINTS[index]
  if (found === undefined) {
    throw new Error(`no tutorial hint at index ${index}`)
  }
  return found
}

describe('tutorial hints', () => {
  it('has one hint per tutorial step, ending on the editor-opened step', () => {
    expect(TUTORIAL_HINTS.length).toBe(8)
    expect(hint(7).isComplete(createWorld(5, 5, 1))).toBe(false)
  })

  it('step 1 completes once a log exists', () => {
    const state = createWorld(5, 5, 1)
    expect(hint(0).isComplete(state)).toBe(false)

    addGroundItem(state, 'log', 1, 1)

    expect(hint(0).isComplete(state)).toBe(true)
  })

  it('step 2 completes once a real stockpile exists, not just a blueprint', () => {
    const state = createWorld(5, 5, 1)
    expect(hint(1).isComplete(state)).toBe(false)

    addStockpile(state, 1, 1)

    expect(hint(1).isComplete(state)).toBe(true)
  })

  it('step 3 completes once a bench saw is built', () => {
    const state = createWorld(5, 5, 1)
    expect(hint(2).isComplete(state)).toBe(false)

    addBenchSaw(state, 1, 1)

    expect(hint(2).isComplete(state)).toBe(true)
  })

  it('step 4 needs both a plank and a block, not just one', () => {
    const state = createWorld(5, 5, 1)
    expect(hint(3).isComplete(state)).toBe(false)

    addGroundItem(state, 'plank', 1, 1)
    expect(hint(3).isComplete(state)).toBe(false)

    addGroundItem(state, 'block', 2, 2)
    expect(hint(3).isComplete(state)).toBe(true)
  })

  it('step 4 completes for planks/blocks sitting in a bench saw\'s storage -- crafting never drops them on the ground', () => {
    const state = createWorld(5, 5, 1)
    const benchSawId = addBenchSaw(state, 1, 1)
    const benchSaw = getEntity(state, benchSawId)
    if (benchSaw === undefined) {
      throw new Error('bench saw missing')
    }
    expect(hint(3).isComplete(state)).toBe(false)

    benchSaw.storage = { plank: 1 }
    expect(hint(3).isComplete(state)).toBe(false)

    benchSaw.storage = { plank: 1, block: 1 }
    expect(hint(3).isComplete(state)).toBe(true)
  })

  it('step 4 completes when the materials are simply being carried, not stored or dropped', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const player = getEntity(state, playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    const benchSawId = addBenchSaw(state, 2, 2)
    const benchSaw = getEntity(state, benchSawId)
    if (benchSaw === undefined) {
      throw new Error('bench saw missing')
    }

    player.held = 'plank'
    expect(hint(3).isComplete(state)).toBe(false) // still no block anywhere

    benchSaw.storage = { block: 1 }
    expect(hint(3).isComplete(state)).toBe(true)
  })

  it('step 5 completes once a mill is built', () => {
    const state = createWorld(5, 5, 1)
    expect(hint(4).isComplete(state)).toBe(false)

    addMill(state, 1, 1)

    expect(hint(4).isComplete(state)).toBe(true)
  })

  it('step 6 completes once flour exists', () => {
    const state = createWorld(5, 5, 1)
    expect(hint(5).isComplete(state)).toBe(false)

    addGroundItem(state, 'flour', 1, 1)

    expect(hint(5).isComplete(state)).toBe(true)
  })

  it('step 6 completes for flour sitting in the mill\'s own storage -- milling never drops it on the ground', () => {
    const state = createWorld(5, 5, 1)
    const millId = addMill(state, 1, 1)
    const mill = getEntity(state, millId)
    if (mill === undefined) {
      throw new Error('mill missing')
    }
    expect(hint(5).isComplete(state)).toBe(false)

    mill.storage = { flour: 1 }

    expect(hint(5).isComplete(state)).toBe(true)
  })

  it('step 7 completes once a bot exists', () => {
    const state = createWorld(5, 5, 1)
    expect(hint(6).isComplete(state)).toBe(false)

    addBot(state, 1, 1)

    expect(hint(6).isComplete(state)).toBe(true)
  })
})
