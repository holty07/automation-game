import { describe, expect, it } from 'vitest'
import { BUILDING_COSTS, createBlueprint } from '../../src/sim/machines'
import { createBotRuntime } from '../../src/sim/vm'
import type { Program } from '../../src/sim/program'
import { addBenchSaw, addBot, addEntity, addPlayer, addStockpile, addTree, createWorld, getEntity } from '../../src/sim/world'
import { describeEntity, formatLabel, pickHoveredEntity } from '../../src/ui/HoverInfo'

describe('formatLabel', () => {
  it('splits camelCase entity types into title case', () => {
    expect(formatLabel('benchSaw')).toBe('Bench Saw')
    expect(formatLabel('tilledSoil')).toBe('Tilled Soil')
  })

  it('capitalises a single-word type as-is', () => {
    expect(formatLabel('log')).toBe('Log')
    expect(formatLabel('stockpile')).toBe('Stockpile')
  })
})

describe('pickHoveredEntity', () => {
  it('prefers a bot over the player sharing its tile', () => {
    const state = createWorld(5, 5, 1)
    addPlayer(state, 2, 2)
    const botId = addBot(state, 2, 2)

    const picked = pickHoveredEntity(state, { x: 2, y: 2 })

    expect(picked?.id).toBe(botId)
  })

  it('prefers a resource over the player standing on non-blocking ground', () => {
    const state = createWorld(5, 5, 1)
    addPlayer(state, 2, 2)
    const treeId = addTree(state, 2, 2)

    const picked = pickHoveredEntity(state, { x: 2, y: 2 })

    expect(picked?.id).toBe(treeId)
  })

  it('returns undefined for an empty tile', () => {
    const state = createWorld(5, 5, 1)

    expect(pickHoveredEntity(state, { x: 0, y: 0 })).toBeUndefined()
  })
})

describe('describeEntity', () => {
  it('shows a blueprint\'s title and delivered/needed counts for every required item', () => {
    const state = createWorld(5, 5, 1)
    const blueprintId = addEntity(state, createBlueprint('benchSaw', { x: 1, y: 1 }))
    const blueprint = getEntity(state, blueprintId)
    if (blueprint === undefined) {
      throw new Error('blueprint missing')
    }
    blueprint.storage = { log: 1 }

    const lines = describeEntity(state, blueprint)

    expect(lines[0]).toBe('Bench Saw blueprint')
    expect(lines).toContain(`Log: 1/${BUILDING_COSTS.benchSaw.log}`)
    expect(lines).toContain(`Stone: 0/${BUILDING_COSTS.benchSaw.stone}`)
  })

  it('shows an empty stockpile as Empty', () => {
    const state = createWorld(5, 5, 1)
    const stockpileId = addStockpile(state, 1, 1)
    const stockpile = getEntity(state, stockpileId)
    if (stockpile === undefined) {
      throw new Error('stockpile missing')
    }

    expect(describeEntity(state, stockpile)).toEqual(['Stockpile', 'Empty'])
  })

  it('shows a stocked container\'s contents', () => {
    const state = createWorld(5, 5, 1)
    const stockpileId = addStockpile(state, 1, 1)
    const stockpile = getEntity(state, stockpileId)
    if (stockpile === undefined) {
      throw new Error('stockpile missing')
    }
    stockpile.storage = { plank: 2, block: 1 }

    expect(describeEntity(state, stockpile)).toEqual(['Stockpile', 'Plank: 2, Block: 1'])
  })

  it('shows a bench saw\'s crafting countdown while it is mid-recipe', () => {
    const state = createWorld(5, 5, 1)
    const benchSawId = addBenchSaw(state, 1, 1)
    const benchSaw = getEntity(state, benchSawId)
    if (benchSaw === undefined) {
      throw new Error('bench saw missing')
    }
    benchSaw.craftingUntilTick = state.tick + 40
    benchSaw.craftingOutput = 'plank'

    expect(describeEntity(state, benchSaw)).toEqual(['Bench Saw', 'Empty', 'Crafting Plank (40 ticks left)'])
  })

  it('shows a bot\'s program name and status', () => {
    const state = createWorld(5, 5, 1)
    const botId = addBot(state, 1, 1)
    const program: Program = { id: 'p', name: 'Chop routine', version: 1, instructions: [] }
    state.programs[program.id] = program
    state.botRuntimes[botId] = createBotRuntime(program.id, program)
    const bot = getEntity(state, botId)
    if (bot === undefined) {
      throw new Error('bot missing')
    }

    expect(describeEntity(state, bot)).toEqual(['Bot', 'Program: Chop routine', 'Status: running'])
  })

  it('falls back to a plain label for a resource with no special detail', () => {
    const state = createWorld(5, 5, 1)
    const treeId = addTree(state, 1, 1)
    const tree = getEntity(state, treeId)
    if (tree === undefined) {
      throw new Error('tree missing')
    }

    expect(describeEntity(state, tree)).toEqual(['Tree'])
  })
})
