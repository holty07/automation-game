import { describe, expect, it } from 'vitest'
import { evaluateCondition } from '../../src/sim/conditions'
import { CONTAINER_CAPACITY } from '../../src/sim/machines'
import { addBot, addStockpile, addTree, createWorld, getEntity } from '../../src/sim/world'

describe('evaluateCondition', () => {
  it('HOLDING is true only when the actor holds that exact item', () => {
    const state = createWorld(5, 5, 1)
    const botId = addBot(state, 0, 0)
    const bot = getEntity(state, botId)
    if (bot === undefined) {
      throw new Error('bot missing')
    }
    bot.held = 'log'

    expect(evaluateCondition(state, botId, { type: 'HOLDING', item: 'log' }, null)).toBe(true)
    expect(evaluateCondition(state, botId, { type: 'HOLDING', item: 'stone' }, null)).toBe(false)
  })

  it('NOT_HOLDING is true only with empty hands', () => {
    const state = createWorld(5, 5, 1)
    const botId = addBot(state, 0, 0)

    expect(evaluateCondition(state, botId, { type: 'NOT_HOLDING' }, null)).toBe(true)

    const bot = getEntity(state, botId)
    if (bot === undefined) {
      throw new Error('bot missing')
    }
    bot.held = 'stone'
    expect(evaluateCondition(state, botId, { type: 'NOT_HOLDING' }, null)).toBe(false)
  })

  it('EXISTS_NEARBY is true when a matching entity exists, honouring an optional radius', () => {
    const state = createWorld(10, 10, 1)
    const botId = addBot(state, 0, 0)
    addTree(state, 5, 0)

    expect(evaluateCondition(state, botId, { type: 'EXISTS_NEARBY', entityType: 'tree' }, null)).toBe(true)
    expect(evaluateCondition(state, botId, { type: 'EXISTS_NEARBY', entityType: 'tree', radius: 2 }, null)).toBe(false)
    expect(evaluateCondition(state, botId, { type: 'EXISTS_NEARBY', entityType: 'rock' }, null)).toBe(false)
  })

  it('CONTAINER_HAS checks a resolved container’s storage for an item', () => {
    const state = createWorld(5, 5, 1)
    const botId = addBot(state, 0, 0)
    const stockpileId = addStockpile(state, 2, 0)
    const stockpile = getEntity(state, stockpileId)
    if (stockpile === undefined) {
      throw new Error('stockpile missing')
    }
    stockpile.storage = { log: 3 }
    const container = { mode: 'nearestOf', entityType: 'stockpile' } as const

    expect(evaluateCondition(state, botId, { type: 'CONTAINER_HAS', container, item: 'log' }, null)).toBe(true)
    expect(evaluateCondition(state, botId, { type: 'CONTAINER_HAS', container, item: 'stone' }, null)).toBe(false)
  })

  it('CONTAINER_HAS is false when the container reference does not resolve', () => {
    const state = createWorld(5, 5, 1)
    const botId = addBot(state, 0, 0)
    const container = { mode: 'nearestOf', entityType: 'stockpile' } as const

    expect(evaluateCondition(state, botId, { type: 'CONTAINER_HAS', container, item: 'log' }, null)).toBe(false)
  })

  it('CONTAINER_FULL is true once the container reaches capacity', () => {
    const state = createWorld(5, 5, 1)
    const botId = addBot(state, 0, 0)
    const stockpileId = addStockpile(state, 2, 0)
    const stockpile = getEntity(state, stockpileId)
    if (stockpile === undefined) {
      throw new Error('stockpile missing')
    }
    const container = { mode: 'nearestOf', entityType: 'stockpile' } as const

    expect(evaluateCondition(state, botId, { type: 'CONTAINER_FULL', container }, null)).toBe(false)

    stockpile.storage = { log: CONTAINER_CAPACITY }
    expect(evaluateCondition(state, botId, { type: 'CONTAINER_FULL', container }, null)).toBe(true)
  })

  it('INVENTORY_FULL is true only while the actor is holding something', () => {
    const state = createWorld(5, 5, 1)
    const botId = addBot(state, 0, 0)

    expect(evaluateCondition(state, botId, { type: 'INVENTORY_FULL' }, null)).toBe(false)

    const bot = getEntity(state, botId)
    if (bot === undefined) {
      throw new Error('bot missing')
    }
    bot.held = 'plank'
    expect(evaluateCondition(state, botId, { type: 'INVENTORY_FULL' }, null)).toBe(true)
  })

  it('never throws for an actor that no longer exists', () => {
    const state = createWorld(5, 5, 1)

    expect(() => evaluateCondition(state, 999, { type: 'NOT_HOLDING' }, null)).not.toThrow()
    expect(evaluateCondition(state, 999, { type: 'NOT_HOLDING' }, null)).toBe(false)
  })
})
