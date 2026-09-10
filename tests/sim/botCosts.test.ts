import { describe, expect, it } from 'vitest'
import { BOT_TIER_COSTS, deductStockedCost, hasStockedCost, nextTier } from '../../src/sim/botCosts'
import { addStockpile, createWorld, getEntity } from '../../src/sim/world'
import type { ItemKind, SimState } from '../../src/sim/types'

function stock(state: SimState, x: number, y: number, storage: Partial<Record<ItemKind, number>>): void {
  const id = addStockpile(state, x, y)
  const stockpile = getEntity(state, id)
  if (stockpile === undefined) {
    throw new Error('stockpile missing')
  }
  stockpile.storage = storage
}

describe('nextTier', () => {
  it('steps mk1 through mk4 in order', () => {
    expect(nextTier('mk1')).toBe('mk2')
    expect(nextTier('mk2')).toBe('mk3')
    expect(nextTier('mk3')).toBe('mk4')
  })

  it('returns null past the highest tier', () => {
    expect(nextTier('mk4')).toBeNull()
  })
})

describe('hasStockedCost', () => {
  it('is true when a single stockpile covers the whole cost', () => {
    const state = createWorld(5, 5, 1)
    stock(state, 1, 1, { plank: 4, block: 2, flour: 1 })

    expect(hasStockedCost(state, BOT_TIER_COSTS.mk1)).toBe(true)
  })

  it('is true when the cost is only covered across multiple stockpiles combined', () => {
    const state = createWorld(5, 5, 1)
    stock(state, 1, 1, { plank: 4 })
    stock(state, 2, 2, { block: 2, flour: 1 })

    expect(hasStockedCost(state, BOT_TIER_COSTS.mk1)).toBe(true)
  })

  it('is false when stock falls short of any single required item', () => {
    const state = createWorld(5, 5, 1)
    stock(state, 1, 1, { plank: 4, block: 1, flour: 1 })

    expect(hasStockedCost(state, BOT_TIER_COSTS.mk1)).toBe(false)
  })

  it('is false when no stockpile exists at all', () => {
    const state = createWorld(5, 5, 1)

    expect(hasStockedCost(state, BOT_TIER_COSTS.mk1)).toBe(false)
  })
})

describe('deductStockedCost', () => {
  it('subtracts the cost from a single stockpile', () => {
    const state = createWorld(5, 5, 1)
    stock(state, 1, 1, { plank: 4, block: 2, flour: 1 })

    deductStockedCost(state, BOT_TIER_COSTS.mk1)

    const stockpile = state.entities.find((entity) => entity.type === 'stockpile')
    expect(stockpile?.storage).toEqual({ plank: 0, block: 0, flour: 0 })
  })

  it('draws from multiple stockpiles, in id order, to cover one item', () => {
    const state = createWorld(5, 5, 1)
    stock(state, 1, 1, { gear: 1 })
    stock(state, 2, 2, { gear: 3 })

    deductStockedCost(state, { gear: 2 })

    const stockpiles = state.entities.filter((entity) => entity.type === 'stockpile')
    expect(stockpiles[0]?.storage).toEqual({ gear: 0 })
    expect(stockpiles[1]?.storage).toEqual({ gear: 2 })
  })
})
