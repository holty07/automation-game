import { describe, expect, it } from 'vitest'
import { addBenchSaw, addBot, addGroundItem, addMill, addStockpile, createWorld } from '../../src/sim/world'
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

  it('step 7 completes once a bot exists', () => {
    const state = createWorld(5, 5, 1)
    expect(hint(6).isComplete(state)).toBe(false)

    addBot(state, 1, 1)

    expect(hint(6).isComplete(state)).toBe(true)
  })
})
