import { describe, expect, it } from 'vitest'
import {
  addBenchSaw,
  addBot,
  addEntity,
  addGroundItem,
  addMill,
  addPlayer,
  addRock,
  addStockpile,
  addStoneCutter,
  addStoneDeposit,
  addTree,
  createWorld,
  getEntity,
  removeEntity,
} from '../../src/sim/world'
import { executeAction } from '../../src/sim/actions'
import { BOT_TIER_COSTS } from '../../src/sim/botCosts'
import { createSoil, createTilledSoil, createWheat, WHEAT_GROW_TICKS } from '../../src/sim/farming'
import { BENCH_SAW_RECIPES, BUILDING_COSTS, CONTAINER_CAPACITY, MILL_RECIPES, STOCKPILE_CAPACITY, STONE_CUTTER_RECIPES, stepBlueprints } from '../../src/sim/machines'
import { stepHarvests } from '../../src/sim/useVerb'
import { createBotRuntime } from '../../src/sim/vm'
import type { Instruction, Program } from '../../src/sim/program'
import type { EntityId, SimState } from '../../src/sim/types'

const PLANK_RECIPE = BENCH_SAW_RECIPES.log
if (PLANK_RECIPE === undefined) {
  throw new Error('expected recipe missing')
}

/** Stocks a fresh stockpile with exactly enough materials for one Mk1 bot, so DEPLOY_BOT tests
 * that aren't themselves about the cost can ignore it. */
function stockMk1Materials(state: SimState, x: number, y: number): void {
  const stockpileId = addStockpile(state, x, y)
  const stockpile = getEntity(state, stockpileId)
  if (stockpile === undefined) {
    throw new Error('stockpile missing')
  }
  stockpile.storage = { ...BOT_TIER_COSTS.mk1 }
}

describe('executeAction', () => {
  it('rejects an unknown actor', () => {
    const state = createWorld(5, 5, 1)

    expect(executeAction(state, 999, { op: 'MOVE_TO', target: { x: 1, y: 1 } })).toEqual({
      ok: false,
      reason: 'unknown actor',
    })
  })

  it('rejects USE on a target that is not a resource', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const otherId = addPlayer(state, 2, 1)

    const result = executeAction(state, playerId, { op: 'USE', target: otherId })

    expect(result.ok).toBe(false)
  })

  it('rejects USE when not adjacent to the resource', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 0, 0)
    const treeId = addTree(state, 4, 4)

    const result = executeAction(state, playerId, { op: 'USE', target: treeId })

    expect(result).toEqual({ ok: false, reason: 'target is out of reach' })
  })

  it('mines a rock: it stays in place mid-mine until the cost elapses, then becomes stone', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const rockId = addRock(state, 2, 1)

    const result = executeAction(state, playerId, { op: 'USE', target: rockId })

    expect(result.ok).toBe(true)
    expect(result.producedEntityId).toBeUndefined()
    expect(result.producedTile).toEqual({ x: 2, y: 1 })
    const rock = getEntity(state, rockId)
    expect(rock?.type).toBe('rock')
    expect(rock?.craftingStartedTick).toBe(state.tick)
    expect(rock?.craftingUntilTick).toBe(state.tick + 60)
    expect(state.entities.some((entity) => entity.type === 'stone')).toBe(false)

    // Not due yet, one tick short of the mining cost (60 ticks — entities.ts's ACTION_COSTS).
    state.tick += 59
    stepHarvests(state)
    expect(getEntity(state, rockId)?.type).toBe('rock')
    expect(state.entities.some((entity) => entity.type === 'stone')).toBe(false)

    // Due now.
    state.tick += 1
    stepHarvests(state)
    expect(getEntity(state, rockId)).toBeUndefined()
    const stone = state.entities.find((entity) => entity.type === 'stone')
    expect(stone?.pos).toEqual({ x: 2, y: 1 })
  })

  it('rejects USE on a tree/rock that is already mid-harvest, rather than restarting its timer', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const rockId = addRock(state, 2, 1)
    executeAction(state, playerId, { op: 'USE', target: rockId })
    const rock = getEntity(state, rockId)
    if (rock === undefined) {
      throw new Error('rock missing')
    }
    const craftingUntilTick = rock.craftingUntilTick
    // Free the actor up without touching the rock's own timer, so a second USE isn't rejected
    // merely for the actor still being busy.
    const player = getEntity(state, playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    player.busyUntilTick = state.tick

    const result = executeAction(state, playerId, { op: 'USE', target: rockId })

    expect(result).toEqual({ ok: false, reason: 'already being harvested' })
    expect(rock.craftingUntilTick).toBe(craftingUntilTick)
  })

  it('rejects mining a stone deposit without a pickaxe held', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const depositId = addStoneDeposit(state, 2, 1)

    const result = executeAction(state, playerId, { op: 'USE', target: depositId })

    expect(result).toEqual({ ok: false, reason: 'needs a pickaxe to mine this' })
    expect(getEntity(state, depositId)?.type).toBe('stoneDeposit')
  })

  it('mines a stone deposit into stone without consuming the deposit or the pickaxe', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const player = getEntity(state, playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    player.held = 'pickaxe'
    const depositId = addStoneDeposit(state, 2, 1)

    const result = executeAction(state, playerId, { op: 'USE', target: depositId })

    expect(result.ok).toBe(true)
    expect(player.held).toBe('pickaxe')
    expect(getEntity(state, depositId)?.type).toBe('stoneDeposit')
    const stone = state.entities.find((entity) => entity.id === result.producedEntityId)
    expect(stone?.type).toBe('stone')
    // Drops at the actor's own feet, not the deposit's tile — the deposit blocks movement, so
    // dropping it there would leave it permanently unreachable.
    expect(stone?.pos).toEqual({ x: 1, y: 1 })
    expect(getEntity(state, depositId)?.pos).toEqual({ x: 2, y: 1 })

    // Mineable again immediately once the actor is free and the ground is clear — never runs out.
    player.busyUntilTick = state.tick
    if (stone === undefined) {
      throw new Error('stone missing')
    }
    removeEntity(state, stone.id) // stand-in for the player having carried the first stone away
    const second = executeAction(state, playerId, { op: 'USE', target: depositId })
    expect(second.ok).toBe(true)
    expect(getEntity(state, depositId)?.type).toBe('stoneDeposit')
  })

  it('rejects mining a stone deposit while the previous stone is still on the ground', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const player = getEntity(state, playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    player.held = 'pickaxe'
    const depositId = addStoneDeposit(state, 2, 1)
    addGroundItem(state, 'stone', 1, 1)

    const result = executeAction(state, playerId, { op: 'USE', target: depositId })

    expect(result).toEqual({ ok: false, reason: 'the ground here already has an item on it' })
    expect(player.held).toBe('pickaxe')
  })

  it('sometimes drops a sapling alongside the log once the chop completes', () => {
    // The sapling roll happens when stepHarvests completes the chop, not when USE commits — but
    // nothing else draws from state.rng in between, so it's still the seed's first draw either way.
    // Seed 7's first rng draw (~0.012) lands under SAPLING_DROP_CHANCE.
    const dropState = createWorld(5, 5, 7)
    const dropPlayerId = addPlayer(dropState, 1, 1)
    const dropTreeId = addTree(dropState, 2, 1)
    executeAction(dropState, dropPlayerId, { op: 'USE', target: dropTreeId })
    dropState.tick += 40
    stepHarvests(dropState)
    expect(dropState.entities.some((entity) => entity.type === 'sapling')).toBe(true)

    // Seed 4's first rng draw (~0.924) lands over SAPLING_DROP_CHANCE.
    const noDropState = createWorld(5, 5, 4)
    const noDropPlayerId = addPlayer(noDropState, 1, 1)
    const noDropTreeId = addTree(noDropState, 2, 1)
    executeAction(noDropState, noDropPlayerId, { op: 'USE', target: noDropTreeId })
    noDropState.tick += 40
    stepHarvests(noDropState)
    expect(noDropState.entities.some((entity) => entity.type === 'sapling')).toBe(false)
  })

  it('drops a bonus sapling on a free adjacent tile, not the log\'s own tile', () => {
    // Seed 7's first rng draw lands a sapling -- see the test above.
    const state = createWorld(5, 5, 7)
    const playerId = addPlayer(state, 1, 1)
    const treeId = addTree(state, 2, 1)
    executeAction(state, playerId, { op: 'USE', target: treeId })
    state.tick += 40

    stepHarvests(state)

    const log = state.entities.find((entity) => entity.type === 'log')
    const sapling = state.entities.find((entity) => entity.type === 'sapling')
    expect(log?.pos).toEqual({ x: 2, y: 1 })
    expect(sapling).toBeDefined()
    expect(sapling?.pos).not.toEqual({ x: 2, y: 1 })
  })

  it('drops no bonus sapling when every adjacent tile is already blocked or occupied', () => {
    const state = createWorld(5, 5, 7)
    const playerId = addPlayer(state, 1, 1)
    const treeId = addTree(state, 2, 1)
    // Surround the tree on all four sides so findFreeAdjacentTile has nowhere to place a sapling:
    // three neighbours blocked by rock, and the fourth -- the player's own tile, the one they
    // stand on to reach the tree -- already has an item at their feet (a reachable state, since a
    // loose item never blocks movement).
    addRock(state, 2, 0)
    addRock(state, 3, 1)
    addRock(state, 2, 2)
    addGroundItem(state, 'stone', 1, 1)
    executeAction(state, playerId, { op: 'USE', target: treeId })
    state.tick += 40

    stepHarvests(state)

    expect(state.entities.some((entity) => entity.type === 'log')).toBe(true)
    expect(state.entities.some((entity) => entity.type === 'sapling')).toBe(false)
  })

  it('leaves a completed chop pending if its own tile somehow already has an item on it', () => {
    const state = createWorld(5, 5, 4) // seed 4 never rolls a sapling -- isolates this to the log
    const playerId = addPlayer(state, 1, 1)
    const treeId = addTree(state, 2, 1)
    const tree = getEntity(state, treeId)
    if (tree === undefined) {
      throw new Error('tree missing')
    }
    executeAction(state, playerId, { op: 'USE', target: treeId })
    state.tick += 40
    // Simulate the (otherwise unreachable) case of the tree's own tile already holding an item.
    addGroundItem(state, 'stone', 2, 1)

    stepHarvests(state)
    expect(getEntity(state, treeId)?.type).toBe('tree')
    expect(state.entities.some((entity) => entity.type === 'log')).toBe(false)

    // Once the ground clears, the pending chop completes on the next tick it's stepped.
    removeEntity(state, state.entities.find((entity) => entity.type === 'stone')?.id ?? -1)
    stepHarvests(state)
    expect(getEntity(state, treeId)).toBeUndefined()
    expect(state.entities.some((entity) => entity.type === 'log')).toBe(true)
  })

  it('tills soil into tilled soil, in place', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const soilId = addEntity(state, createSoil({ x: 2, y: 1 }))

    const result = executeAction(state, playerId, { op: 'USE', target: soilId })

    expect(result.ok).toBe(true)
    expect(getEntity(state, soilId)).toBeUndefined()
    const tilled = state.entities.find((entity) => entity.id === result.producedEntityId)
    expect(tilled?.type).toBe('tilledSoil')
    expect(tilled?.pos).toEqual({ x: 2, y: 1 })
  })

  it('sows tilled soil into a growing seedling', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const tilledId = addEntity(state, createTilledSoil({ x: 2, y: 1 }))

    const result = executeAction(state, playerId, { op: 'USE', target: tilledId })

    expect(result.ok).toBe(true)
    const seedling = state.entities.find((entity) => entity.id === result.producedEntityId)
    expect(seedling?.type).toBe('seedling')
    expect(seedling?.craftingStartedTick).toBe(state.tick)
    expect(seedling?.craftingUntilTick).toBe(state.tick + WHEAT_GROW_TICKS)
  })

  it('harvests wheat into grain, leaving tilled soil behind ready to re-sow', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const wheatId = addEntity(state, createWheat({ x: 2, y: 1 }))

    const result = executeAction(state, playerId, { op: 'USE', target: wheatId })

    expect(result.ok).toBe(true)
    expect(getEntity(state, wheatId)).toBeUndefined()
    const grain = state.entities.find((entity) => entity.id === result.producedEntityId)
    expect(grain?.type).toBe('grain')
    // Drops at the actor's own feet, not the wheat's tile — see useVerb.ts's useWheat.
    expect(grain?.pos).toEqual({ x: 1, y: 1 })
    const tilled = state.entities.find((entity) => entity.type === 'tilledSoil')
    expect(tilled?.pos).toEqual({ x: 2, y: 1 })
  })

  it('rejects harvesting wheat while the actor already has an item at their feet', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const wheatId = addEntity(state, createWheat({ x: 2, y: 1 }))
    addGroundItem(state, 'grain', 1, 1)

    const result = executeAction(state, playerId, { op: 'USE', target: wheatId })

    expect(result).toEqual({ ok: false, reason: 'the ground here already has an item on it' })
    expect(getEntity(state, wheatId)?.type).toBe('wheat')
  })

  it('plants a held sapling into a growing young tree on an adjacent, empty tile', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const player = getEntity(state, playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    player.held = 'sapling'

    const result = executeAction(state, playerId, { op: 'PLANT', target: { x: 2, y: 1 } })

    expect(result.ok).toBe(true)
    expect(player.held).toBeNull()
    const youngTree = state.entities.find((entity) => entity.id === result.producedEntityId)
    expect(youngTree?.type).toBe('youngTree')
    expect(youngTree?.pos).toEqual({ x: 2, y: 1 })
  })

  it('rejects PICK_UP when hands are already full', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    addGroundItem(state, 'log', 1, 1)
    const player = state.entities.find((entity) => entity.id === playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    player.held = 'stone'

    const item = state.entities.find((entity) => entity.type === 'log')
    if (item === undefined) {
      throw new Error('log missing')
    }
    const result = executeAction(state, playerId, { op: 'PICK_UP', target: item.id })

    expect(result).toEqual({ ok: false, reason: 'hands are full' })
  })

  it('rejects PICK_UP when the item is on a different tile', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const itemId = addGroundItem(state, 'log', 2, 2)

    const result = executeAction(state, playerId, { op: 'PICK_UP', target: itemId })

    expect(result).toEqual({ ok: false, reason: 'target is out of reach' })
  })

  it('rejects DROP when not holding anything', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)

    const result = executeAction(state, playerId, { op: 'DROP', target: { x: 1, y: 1 } })

    expect(result).toEqual({ ok: false, reason: 'not holding anything' })
  })

  it('rejects DROP at a tile other than the actor’s own', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const player = state.entities.find((entity) => entity.id === playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    player.held = 'log'

    const result = executeAction(state, playerId, { op: 'DROP', target: { x: 2, y: 1 } })

    expect(result).toEqual({ ok: false, reason: 'can only drop at your own feet' })
    expect(player.held).toBe('log')
  })

  it('drops the held item as a ground item at the actor’s own feet', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const player = getEntity(state, playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    player.held = 'log'

    const result = executeAction(state, playerId, { op: 'DROP', target: { x: 1, y: 1 } })

    expect(result.ok).toBe(true)
    expect(player.held).toBeNull()
    const dropped = getEntity(state, result.producedEntityId ?? -1)
    expect(dropped?.type).toBe('log')
    expect(dropped?.pos).toEqual({ x: 1, y: 1 })
  })

  it('rejects DROP onto a tile that already holds a ground item', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    addGroundItem(state, 'stone', 1, 1)
    const player = getEntity(state, playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    player.held = 'log'

    const result = executeAction(state, playerId, { op: 'DROP', target: { x: 1, y: 1 } })

    expect(result).toEqual({ ok: false, reason: 'the ground here already has an item on it' })
    expect(player.held).toBe('log')
    expect(state.entities.some((entity) => entity.type === 'log')).toBe(false)
  })

  it('rejects MOVE_TO outside the world', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)

    const result = executeAction(state, playerId, { op: 'MOVE_TO', target: { x: -1, y: 1 } })

    expect(result).toEqual({ ok: false, reason: 'target is out of bounds' })
  })

  it('walks a multi-tile path towards a distant target', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 0, 0)

    const result = executeAction(state, playerId, { op: 'MOVE_TO', target: { x: 3, y: 0 } })
    expect(result.ok).toBe(true)

    const player = state.entities.find((entity) => entity.id === playerId)
    expect(player?.path).toEqual([{ x: 2, y: 0 }, { x: 3, y: 0 }])
    expect(player?.moveTarget).toEqual({ x: 1, y: 0 })
  })

  it('rejects starting a new action while one is already in flight', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    const treeId = addTree(state, 2, 1)
    executeAction(state, playerId, { op: 'USE', target: treeId })

    const result = executeAction(state, playerId, { op: 'MOVE_TO', target: { x: 0, y: 0 } })

    expect(result).toEqual({ ok: false, reason: 'actor is busy' })
  })

  it('rejects MOVE_TO onto a blocked tile', () => {
    const state = createWorld(5, 5, 1)
    const playerId = addPlayer(state, 1, 1)
    addTree(state, 2, 1)

    const result = executeAction(state, playerId, { op: 'MOVE_TO', target: { x: 2, y: 1 } })

    expect(result).toEqual({ ok: false, reason: 'target is blocked' })
  })

  describe('GIVE_TO', () => {
    it('stores a held item in a stockpile', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const stockpileId = addStockpile(state, 2, 1)
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'log'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: stockpileId })

      expect(result.ok).toBe(true)
      expect(player.held).toBeNull()
      expect(getEntity(state, stockpileId)?.storage).toEqual({ log: 1 })
    })

    it('adds more of the same kind to a stockpile already holding it', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const stockpileId = addStockpile(state, 2, 1)
      const stockpile = getEntity(state, stockpileId)
      const player = getEntity(state, playerId)
      if (stockpile === undefined || player === undefined) {
        throw new Error('missing entity')
      }
      stockpile.storage = { log: 2 }
      player.held = 'log'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: stockpileId })

      expect(result.ok).toBe(true)
      expect(stockpile.storage).toEqual({ log: 3 })
    })

    it('rejects GIVE_TO a stockpile already locked to a different kind', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const stockpileId = addStockpile(state, 2, 1)
      const stockpile = getEntity(state, stockpileId)
      const player = getEntity(state, playerId)
      if (stockpile === undefined || player === undefined) {
        throw new Error('missing entity')
      }
      stockpile.storage = { log: 1 }
      player.held = 'stone'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: stockpileId })

      expect(result).toEqual({ ok: false, reason: 'this stockpile only holds log' })
      expect(player.held).toBe('stone')
      expect(stockpile.storage).toEqual({ log: 1 })
    })

    it('accepts a different kind once a stockpile has been fully emptied of the last one', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const stockpileId = addStockpile(state, 2, 1)
      const stockpile = getEntity(state, stockpileId)
      const player = getEntity(state, playerId)
      if (stockpile === undefined || player === undefined) {
        throw new Error('missing entity')
      }
      stockpile.storage = { log: 0 }
      player.held = 'stone'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: stockpileId })

      expect(result.ok).toBe(true)
      expect(stockpile.storage).toEqual({ log: 0, stone: 1 })
    })

    it('rejects GIVE_TO when not holding anything', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const stockpileId = addStockpile(state, 2, 1)

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: stockpileId })

      expect(result).toEqual({ ok: false, reason: 'not holding anything' })
    })

    it('rejects GIVE_TO a target that is not a container', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const otherId = addPlayer(state, 2, 1)
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'log'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: otherId })

      expect(result).toEqual({ ok: false, reason: 'nothing to give to there' })
    })

    it('feeds a log into a bench saw, starting its recipe', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const benchSawId = addBenchSaw(state, 2, 1)
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'log'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: benchSawId })

      expect(result.ok).toBe(true)
      expect(player.held).toBeNull()
      expect(getEntity(state, benchSawId)?.craftingStartedTick).toBe(state.tick)
      expect(getEntity(state, benchSawId)?.craftingUntilTick).toBe(state.tick + PLANK_RECIPE.ticks)
      expect(getEntity(state, benchSawId)?.craftingOutput).toBe('plank')
    })

    it('feeds a plank into a bench saw, starting the pickaxe recipe', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const benchSawId = addBenchSaw(state, 2, 1)
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'plank'
      const pickaxeRecipe = BENCH_SAW_RECIPES.plank
      if (pickaxeRecipe === undefined) {
        throw new Error('expected recipe missing')
      }

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: benchSawId })

      expect(result.ok).toBe(true)
      expect(player.held).toBeNull()
      expect(getEntity(state, benchSawId)?.craftingStartedTick).toBe(state.tick)
      expect(getEntity(state, benchSawId)?.craftingUntilTick).toBe(state.tick + pickaxeRecipe.ticks)
      expect(getEntity(state, benchSawId)?.craftingOutput).toBe('pickaxe')
    })

    it('feeds grain into a mill, starting its recipe', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const millId = addMill(state, 2, 1)
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'grain'
      const flourRecipe = MILL_RECIPES.grain
      if (flourRecipe === undefined) {
        throw new Error('expected recipe missing')
      }

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: millId })

      expect(result.ok).toBe(true)
      expect(player.held).toBeNull()
      expect(getEntity(state, millId)?.craftingStartedTick).toBe(state.tick)
      expect(getEntity(state, millId)?.craftingUntilTick).toBe(state.tick + flourRecipe.ticks)
      expect(getEntity(state, millId)?.craftingOutput).toBe('flour')
    })

    it('rejects feeding a mill a log, since the mill only mills grain', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const millId = addMill(state, 2, 1)
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'log'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: millId })

      expect(result).toEqual({ ok: false, reason: 'the machine cannot use that' })
    })

    it('rejects feeding a bench saw an item none of its recipes accept', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const benchSawId = addBenchSaw(state, 2, 1)
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'grain'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: benchSawId })

      expect(result).toEqual({ ok: false, reason: 'the machine cannot use that' })
    })

    it('rejects feeding a bench saw that is already crafting', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const benchSawId = addBenchSaw(state, 2, 1)
      const benchSaw = getEntity(state, benchSawId)
      if (benchSaw === undefined) {
        throw new Error('bench saw missing')
      }
      benchSaw.craftingUntilTick = state.tick + PLANK_RECIPE.ticks
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'log'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: benchSawId })

      expect(result).toEqual({ ok: false, reason: 'the machine is busy' })
    })

    it('rejects GIVE_TO when not adjacent to the container', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 0, 0)
      const stockpileId = addStockpile(state, 4, 4)
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'log'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: stockpileId })

      expect(result).toEqual({ ok: false, reason: 'target is out of reach' })
    })

    it('rejects GIVE_TO once a stockpile reaches its (larger) capacity', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const stockpileId = addStockpile(state, 2, 1)
      const stockpile = getEntity(state, stockpileId)
      const player = getEntity(state, playerId)
      if (stockpile === undefined || player === undefined) {
        throw new Error('missing entity')
      }
      stockpile.storage = { log: STOCKPILE_CAPACITY - 1 }
      player.held = 'log'

      // One below capacity still accepts a delivery...
      expect(executeAction(state, playerId, { op: 'GIVE_TO', target: stockpileId }).ok).toBe(true)
      expect(stockpile.storage).toEqual({ log: STOCKPILE_CAPACITY })

      // ...but at capacity, the next one is rejected.
      player.held = 'log'
      player.busyUntilTick = state.tick
      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: stockpileId })

      expect(result).toEqual({ ok: false, reason: 'container is full' })
      expect(player.held).toBe('log')
    })

    it('rejects GIVE_TO once a machine reaches its (smaller) capacity, well below a stockpile\'s', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const benchSawId = addBenchSaw(state, 2, 1)
      const benchSaw = getEntity(state, benchSawId)
      const player = getEntity(state, playerId)
      if (benchSaw === undefined || player === undefined) {
        throw new Error('missing entity')
      }
      // A pile of an item the bench saw doesn't craft from, so the capacity check is what's under
      // test here, not the recipe lookup.
      benchSaw.storage = { core: CONTAINER_CAPACITY }
      player.held = 'log'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: benchSawId })

      expect(result).toEqual({ ok: false, reason: 'container is full' })
      expect(player.held).toBe('log')
    })

    it('feeds a stone into a stone cutter, starting its recipe', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const stoneCutterId = addStoneCutter(state, 2, 1)
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'stone'
      const blockRecipe = STONE_CUTTER_RECIPES.stone
      if (blockRecipe === undefined) {
        throw new Error('expected recipe missing')
      }

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: stoneCutterId })

      expect(result.ok).toBe(true)
      expect(player.held).toBeNull()
      expect(getEntity(state, stoneCutterId)?.craftingStartedTick).toBe(state.tick)
      expect(getEntity(state, stoneCutterId)?.craftingUntilTick).toBe(state.tick + blockRecipe.ticks)
      expect(getEntity(state, stoneCutterId)?.craftingOutput).toBe('block')
    })

    it('rejects feeding a bench saw stone, since blocks are now the stone cutter\'s job', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const benchSawId = addBenchSaw(state, 2, 1)
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'stone'

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: benchSawId })

      expect(result).toEqual({ ok: false, reason: 'the machine cannot use that' })
    })
  })

  describe('WAIT', () => {
    it('idles the actor for the requested number of ticks', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)

      const result = executeAction(state, playerId, { op: 'WAIT', ticks: 10 })

      expect(result).toEqual({ ok: true })
      expect(getEntity(state, playerId)?.busyUntilTick).toBe(state.tick + 10)
    })
  })

  describe('SET_FAILURE_POLICY', () => {
    it('changes a bot’s failure policy even while it is mid-action', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)
      const program: Program = { id: 'p', name: 'noop', version: 1, instructions: [] }
      state.programs[program.id] = program
      state.botRuntimes[botId] = createBotRuntime(program.id, program)
      const bot = getEntity(state, botId)
      if (bot === undefined) {
        throw new Error('bot missing')
      }
      bot.busyUntilTick = state.tick + 100

      const result = executeAction(state, botId, { op: 'SET_FAILURE_POLICY', botId, policy: 'skip' })

      expect(result).toEqual({ ok: true })
      expect(state.botRuntimes[botId]?.failurePolicy).toBe('skip')
    })

    it('rejects setting the policy of a bot with no program assigned', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)

      const result = executeAction(state, botId, { op: 'SET_FAILURE_POLICY', botId, policy: 'halt' })

      expect(result).toEqual({ ok: false, reason: 'bot has no program assigned' })
    })
  })

  describe('SET_BOT_PAUSED', () => {
    it('pauses and resumes a bot', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)
      const program: Program = { id: 'p', name: 'noop', version: 1, instructions: [] }
      state.programs[program.id] = program
      state.botRuntimes[botId] = createBotRuntime(program.id, program)

      const paused = executeAction(state, botId, { op: 'SET_BOT_PAUSED', botId, paused: true })
      expect(paused).toEqual({ ok: true })
      expect(state.botRuntimes[botId]?.paused).toBe(true)

      const resumed = executeAction(state, botId, { op: 'SET_BOT_PAUSED', botId, paused: false })
      expect(resumed).toEqual({ ok: true })
      expect(state.botRuntimes[botId]?.paused).toBe(false)
    })

    it('shifts a mid-action bot’s busyUntilTick forward by however long the pause lasted, preserving its remaining cooldown', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)
      const program: Program = { id: 'p', name: 'noop', version: 1, instructions: [] }
      state.programs[program.id] = program
      state.botRuntimes[botId] = createBotRuntime(program.id, program)
      const bot = getEntity(state, botId)
      if (bot === undefined) {
        throw new Error('bot missing')
      }
      // 40 ticks of cooldown left when the pause hits.
      bot.busyUntilTick = state.tick + 40

      executeAction(state, botId, { op: 'SET_BOT_PAUSED', botId, paused: true })
      // state.tick keeps advancing globally even while this one bot is paused.
      state.tick += 1000
      executeAction(state, botId, { op: 'SET_BOT_PAUSED', botId, paused: false })

      // The 40 remaining ticks at the moment of pause must still be owed after resuming, not
      // instantly satisfied by the 1000 ticks that passed while paused.
      expect(bot.busyUntilTick).toBe(state.tick + 40)
    })

    it('leaves busyUntilTick alone when the bot was not actually mid-cooldown at the moment it paused', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)
      const program: Program = { id: 'p', name: 'noop', version: 1, instructions: [] }
      state.programs[program.id] = program
      state.botRuntimes[botId] = createBotRuntime(program.id, program)
      const bot = getEntity(state, botId)
      if (bot === undefined) {
        throw new Error('bot missing')
      }
      bot.busyUntilTick = state.tick

      executeAction(state, botId, { op: 'SET_BOT_PAUSED', botId, paused: true })
      state.tick += 1000
      executeAction(state, botId, { op: 'SET_BOT_PAUSED', botId, paused: false })

      expect(bot.busyUntilTick).toBe(0)
    })

    it('rejects pausing a bot with no program assigned', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)

      const result = executeAction(state, botId, { op: 'SET_BOT_PAUSED', botId, paused: true })

      expect(result).toEqual({ ok: false, reason: 'bot has no program assigned' })
    })
  })

  describe('TAKE_FROM', () => {
    it('takes an item out of a stockpile', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const stockpileId = addStockpile(state, 2, 1)
      const stockpile = getEntity(state, stockpileId)
      if (stockpile === undefined || stockpile.storage === null) {
        throw new Error('stockpile missing')
      }
      stockpile.storage.plank = 2

      const result = executeAction(state, playerId, { op: 'TAKE_FROM', target: stockpileId, item: 'plank' })

      expect(result.ok).toBe(true)
      expect(getEntity(state, playerId)?.held).toBe('plank')
      expect(stockpile.storage).toEqual({ plank: 1 })
    })

    it('rejects TAKE_FROM when hands are already full', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const stockpileId = addStockpile(state, 2, 1)
      const stockpile = getEntity(state, stockpileId)
      if (stockpile === undefined || stockpile.storage === null) {
        throw new Error('stockpile missing')
      }
      stockpile.storage.plank = 1
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      player.held = 'log'

      const result = executeAction(state, playerId, { op: 'TAKE_FROM', target: stockpileId, item: 'plank' })

      expect(result).toEqual({ ok: false, reason: 'hands are full' })
    })

    it('rejects TAKE_FROM when the container has none of that kind', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const stockpileId = addStockpile(state, 2, 1)

      const result = executeAction(state, playerId, { op: 'TAKE_FROM', target: stockpileId, item: 'plank' })

      expect(result).toEqual({ ok: false, reason: 'nothing of that kind to take' })
    })

    it('collects a finished plank from a bench saw', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const benchSawId = addBenchSaw(state, 2, 1)
      const benchSaw = getEntity(state, benchSawId)
      if (benchSaw === undefined || benchSaw.storage === null) {
        throw new Error('bench saw missing')
      }
      benchSaw.storage.plank = 1

      const result = executeAction(state, playerId, { op: 'TAKE_FROM', target: benchSawId, item: 'plank' })

      expect(result.ok).toBe(true)
      expect(getEntity(state, playerId)?.held).toBe('plank')
    })
  })

  describe('BUILD', () => {
    it('places a stockpile blueprint on an empty adjacent tile, not the finished stockpile', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)

      const result = executeAction(state, playerId, { op: 'BUILD', kind: 'stockpile', target: { x: 2, y: 1 } })

      expect(result.ok).toBe(true)
      const built = getEntity(state, result.producedEntityId ?? -1)
      expect(built?.type).toBe('blueprint')
      expect(built?.blueprintOf).toBe('stockpile')
      expect(built?.storage).toEqual({})
    })

    it('places a bench saw blueprint on an empty adjacent tile', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)

      const result = executeAction(state, playerId, { op: 'BUILD', kind: 'benchSaw', target: { x: 2, y: 1 } })

      expect(result.ok).toBe(true)
      const built = getEntity(state, result.producedEntityId ?? -1)
      expect(built?.type).toBe('blueprint')
      expect(built?.blueprintOf).toBe('benchSaw')
      expect(built?.craftingUntilTick).toBeNull()
    })

    it('places a stone cutter blueprint on an empty adjacent tile', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)

      const result = executeAction(state, playerId, { op: 'BUILD', kind: 'stoneCutter', target: { x: 2, y: 1 } })

      expect(result.ok).toBe(true)
      const built = getEntity(state, result.producedEntityId ?? -1)
      expect(built?.type).toBe('blueprint')
      expect(built?.blueprintOf).toBe('stoneCutter')
      expect(built?.storage).toEqual({})
    })

    it('places a mill blueprint on an empty adjacent tile', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)

      const result = executeAction(state, playerId, { op: 'BUILD', kind: 'mill', target: { x: 2, y: 1 } })

      expect(result.ok).toBe(true)
      const built = getEntity(state, result.producedEntityId ?? -1)
      expect(built?.type).toBe('blueprint')
      expect(built?.blueprintOf).toBe('mill')
      expect(built?.storage).toEqual({})
    })

    it('places a bot blueprint on an empty adjacent tile', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)

      const result = executeAction(state, playerId, { op: 'BUILD', kind: 'bot', target: { x: 2, y: 1 } })

      expect(result.ok).toBe(true)
      const built = getEntity(state, result.producedEntityId ?? -1)
      expect(built?.type).toBe('blueprint')
      expect(built?.blueprintOf).toBe('bot')
      expect(built?.storage).toEqual({})
      // No runtime yet — a bot blueprint only becomes a real, running bot once stepBlueprints
      // sees its storage cover BUILDING_COSTS.bot (see machines.test.ts).
      expect(state.botRuntimes[result.producedEntityId ?? -1]).toBeUndefined()
    })

    it('a fully-delivered blueprint becomes its finished building once stepBlueprints runs', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      const buildResult = executeAction(state, playerId, { op: 'BUILD', kind: 'stockpile', target: { x: 2, y: 1 } })
      const blueprintId = buildResult.producedEntityId
      if (blueprintId === undefined) {
        throw new Error('blueprint missing')
      }
      const logCost = BUILDING_COSTS.stockpile.log ?? 0

      // Deliver every log but one -- still short, so it must not complete.
      for (let i = 0; i < logCost - 1; i += 1) {
        player.held = 'log'
        player.busyUntilTick = state.tick // each GIVE_TO leaves the actor busy; clear it between calls
        expect(executeAction(state, playerId, { op: 'GIVE_TO', target: blueprintId }).ok).toBe(true)
      }
      stepBlueprints(state)
      expect(getEntity(state, blueprintId)?.type).toBe('blueprint')

      // Deliver the last log -- now it must complete.
      player.held = 'log'
      player.busyUntilTick = state.tick
      expect(executeAction(state, playerId, { op: 'GIVE_TO', target: blueprintId }).ok).toBe(true)
      stepBlueprints(state)

      const finished = getEntity(state, blueprintId)
      expect(finished?.type).toBe('stockpile')
      expect(finished?.blueprintOf).toBeNull()
      expect(finished?.storage).toEqual({})
    })

    it('rejects delivering an item a blueprint does not need', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      const buildResult = executeAction(state, playerId, { op: 'BUILD', kind: 'stockpile', target: { x: 2, y: 1 } })
      const blueprintId = buildResult.producedEntityId
      if (blueprintId === undefined) {
        throw new Error('blueprint missing')
      }
      player.held = 'flour'
      player.busyUntilTick = state.tick // BUILD left the actor busy

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: blueprintId })

      expect(result).toEqual({ ok: false, reason: 'the blueprint does not need that' })
    })

    it('rejects delivering an item once the blueprint already has enough of it', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const player = getEntity(state, playerId)
      if (player === undefined) {
        throw new Error('player missing')
      }
      const buildResult = executeAction(state, playerId, { op: 'BUILD', kind: 'stockpile', target: { x: 2, y: 1 } })
      const blueprintId = buildResult.producedEntityId
      if (blueprintId === undefined) {
        throw new Error('blueprint missing')
      }
      const blueprint = getEntity(state, blueprintId)
      if (blueprint === undefined || blueprint.storage === null) {
        throw new Error('blueprint missing storage')
      }
      blueprint.storage.log = BUILDING_COSTS.stockpile.log
      player.held = 'log'
      player.busyUntilTick = state.tick // BUILD left the actor busy

      const result = executeAction(state, playerId, { op: 'GIVE_TO', target: blueprintId })

      expect(result).toEqual({ ok: false, reason: 'the blueprint already has enough of that' })
    })

    it('rejects BUILD outside the world', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 0, 0)

      const result = executeAction(state, playerId, { op: 'BUILD', kind: 'stockpile', target: { x: -1, y: 0 } })

      expect(result).toEqual({ ok: false, reason: 'target is out of bounds' })
    })

    it('rejects BUILD on a tile that is not adjacent', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 0, 0)

      const result = executeAction(state, playerId, { op: 'BUILD', kind: 'stockpile', target: { x: 4, y: 4 } })

      expect(result).toEqual({ ok: false, reason: 'target is out of reach' })
    })

    it('rejects BUILD on an occupied tile', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      addTree(state, 2, 1)

      const result = executeAction(state, playerId, { op: 'BUILD', kind: 'stockpile', target: { x: 2, y: 1 } })

      expect(result).toEqual({ ok: false, reason: 'target is occupied' })
    })
  })

  describe('EDIT_PROGRAM', () => {
    it('replaces the instructions and resets the frame stack, so an edit takes effect immediately', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      stockMk1Materials(state, 0, 0)
      const program = {
        id: 'recorded-1',
        name: 'Recorded 1',
        version: 1,
        instructions: [{ id: '1', op: 'MOVE_TO' as const, args: [{ mode: 'absolute' as const, tile: { x: 1, y: 1 } }] }],
      }
      const deployResult = executeAction(state, playerId, { op: 'DEPLOY_BOT', program })
      const botId = deployResult.producedEntityId
      expect(botId).toBeDefined()
      const runtime = state.botRuntimes[botId ?? -1]
      if (runtime === undefined) {
        throw new Error('bot runtime missing')
      }
      // Simulate the bot mid-way through its program, blocked, with a stale lastResult register.
      const frame = runtime.frames[0]
      if (frame === undefined) {
        throw new Error('frame missing')
      }
      frame.index = 5
      runtime.status = 'blocked'
      runtime.blockedReason = 'stale'
      runtime.lastResult = { kind: 'tile', tile: { x: 9, y: 9 } }

      const newInstructions = [
        { id: '2', op: 'MOVE_TO' as const, args: [{ mode: 'absolute' as const, tile: { x: 2, y: 2 } }] },
      ]
      const result = executeAction(state, botId ?? -1, { op: 'EDIT_PROGRAM', botId: botId ?? -1, instructions: newInstructions })

      expect(result).toEqual({ ok: true })
      expect(state.programs[program.id]?.instructions).toEqual(newInstructions)
      expect(runtime.frames).toEqual([{ instructions: newInstructions, index: 0, iterationsLeft: 1 }])
      expect(runtime.currentAction).toBeNull()
      expect(runtime.status).toBe('running')
      expect(runtime.blockedReason).toBeUndefined()
      expect(runtime.lastResult).toBeNull()
    })

    it('is not gated by the actor-busy check, so editing works while the bot is mid-action', () => {
      const state = createWorld(5, 5, 1)
      const botId = addPlayer(state, 1, 1)
      const program = { id: 'p', name: 'p', version: 1, instructions: [] }
      state.programs[program.id] = program
      state.botRuntimes[botId] = {
        programId: program.id,
        tier: 'mk1',
        frames: [{ instructions: [], index: 0, iterationsLeft: 1 }],
        currentAction: null,
        status: 'running',
        failurePolicy: 'wait',
        paused: false,
        pausedAtTick: null,
        lastResult: null,
        blockedRetryAt: 0,
      }
      const busyActor = getEntity(state, botId)
      if (busyActor === undefined) {
        throw new Error('actor missing')
      }
      busyActor.busyUntilTick = state.tick + 100

      const result = executeAction(state, botId, { op: 'EDIT_PROGRAM', botId, instructions: [] })

      expect(result).toEqual({ ok: true })
    })

    it('rejects editing a bot with no program assigned', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)

      const result = executeAction(state, playerId, { op: 'EDIT_PROGRAM', botId: playerId, instructions: [] })

      expect(result).toEqual({ ok: false, reason: 'bot has no program assigned' })
    })
  })

  describe('DEPLOY_BOT', () => {
    it('spawns a running bot at the actor position and registers the program, costed from stockpiles', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      stockMk1Materials(state, 0, 0)
      const program = {
        id: 'recorded-1',
        name: 'Recorded 1',
        version: 1,
        instructions: [{ id: '1', op: 'MOVE_TO' as const, args: [{ mode: 'absolute' as const, tile: { x: 1, y: 1 } }] }],
      }

      const result = executeAction(state, playerId, { op: 'DEPLOY_BOT', program })

      expect(result.ok).toBe(true)
      const botId = result.producedEntityId
      expect(botId).toBeDefined()
      const bot = getEntity(state, botId ?? -1)
      expect(bot?.type).toBe('bot')
      expect(bot?.pos).toEqual({ x: 1, y: 1 })
      expect(state.programs[program.id]).toBe(program)
      expect(state.botRuntimes[botId ?? -1]?.status).toBe('running')
      expect(state.botRuntimes[botId ?? -1]?.programId).toBe(program.id)
    })

    it('rejects deploying when no stockpile holds enough materials', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 1, 1)
      const program = { id: 'p', name: 'p', version: 1, instructions: [] }

      const result = executeAction(state, playerId, { op: 'DEPLOY_BOT', program })

      expect(result).toEqual({ ok: false, reason: 'not enough materials in a stockpile to build a Mk1 bot' })
      expect(state.entities.some((entity) => entity.type === 'bot')).toBe(false)
    })

    it('draws combined cost from multiple stockpiles across the world', () => {
      const state = createWorld(5, 5, 1)
      const playerId = addPlayer(state, 2, 2)
      const stockpileAId = addStockpile(state, 0, 0)
      const stockpileBId = addStockpile(state, 4, 4)
      const a = getEntity(state, stockpileAId)
      const b = getEntity(state, stockpileBId)
      if (a === undefined || b === undefined) {
        throw new Error('stockpile missing')
      }
      a.storage = { plank: 4, block: 1 }
      b.storage = { block: 1, flour: 1 }
      const program = { id: 'p', name: 'p', version: 1, instructions: [] }

      const result = executeAction(state, playerId, { op: 'DEPLOY_BOT', program })

      expect(result.ok).toBe(true)
      expect(a.storage).toEqual({ plank: 0, block: 0 })
      expect(b.storage).toEqual({ block: 0, flour: 0 })
    })
  })

  describe('SET_BOT_TIER', () => {
    it('sets a bot’s tier', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)
      const program: Program = { id: 'p', name: 'p', version: 1, instructions: [] }
      state.programs[program.id] = program
      state.botRuntimes[botId] = createBotRuntime(program.id, program)

      const result = executeAction(state, botId, { op: 'SET_BOT_TIER', botId, tier: 'mk4' })

      expect(result).toEqual({ ok: true })
      expect(state.botRuntimes[botId]?.tier).toBe('mk4')
    })

    it('rejects setting the tier of a bot with no program assigned', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)

      const result = executeAction(state, botId, { op: 'SET_BOT_TIER', botId, tier: 'mk2' })

      expect(result).toEqual({ ok: false, reason: 'bot has no program assigned' })
    })
  })

  describe('UPGRADE_BOT_TIER', () => {
    function botAt(state: SimState, tier: 'mk1' | 'mk2' | 'mk3' | 'mk4'): EntityId {
      const botId = addBot(state, 0, 0)
      const program: Program = { id: 'p', name: 'p', version: 1, instructions: [] }
      state.programs[program.id] = program
      state.botRuntimes[botId] = createBotRuntime(program.id, program, 'wait', tier)
      return botId
    }

    it('upgrades to the next tier, costed from stockpiles', () => {
      const state = createWorld(5, 5, 1)
      const botId = botAt(state, 'mk1')
      stockMk1Materials(state, 1, 1)
      const stockpile = state.entities.find((entity) => entity.type === 'stockpile')
      if (stockpile === undefined || stockpile.storage === null) {
        throw new Error('stockpile missing')
      }
      stockpile.storage.gear = 2

      const result = executeAction(state, botId, { op: 'UPGRADE_BOT_TIER', botId })

      expect(result).toEqual({ ok: true })
      expect(state.botRuntimes[botId]?.tier).toBe('mk2')
      expect(stockpile.storage.gear).toBe(0)
    })

    it('rejects upgrading without enough stocked materials, leaving the tier unchanged', () => {
      const state = createWorld(5, 5, 1)
      const botId = botAt(state, 'mk1')

      const result = executeAction(state, botId, { op: 'UPGRADE_BOT_TIER', botId })

      expect(result).toEqual({ ok: false, reason: 'not enough materials in a stockpile to upgrade to mk2' })
      expect(state.botRuntimes[botId]?.tier).toBe('mk1')
    })

    it('rejects upgrading past the highest tier', () => {
      const state = createWorld(5, 5, 1)
      const botId = botAt(state, 'mk4')

      const result = executeAction(state, botId, { op: 'UPGRADE_BOT_TIER', botId })

      expect(result).toEqual({ ok: false, reason: 'bot is already at the highest tier' })
    })

    it('rejects upgrading a bot with no program assigned', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)

      const result = executeAction(state, botId, { op: 'UPGRADE_BOT_TIER', botId })

      expect(result).toEqual({ ok: false, reason: 'bot has no program assigned' })
    })
  })

  describe('SAVE_ROUTINE', () => {
    it('snapshots a bot’s current program into the routine library', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)
      const instructions: Instruction[] = [{ id: '1', op: 'MOVE_TO', args: [{ mode: 'absolute', tile: { x: 1, y: 1 } }] }]
      const program: Program = { id: 'p', name: 'p', version: 1, instructions }
      state.programs[program.id] = program
      state.botRuntimes[botId] = createBotRuntime(program.id, program)

      const result = executeAction(state, botId, { op: 'SAVE_ROUTINE', botId, routineId: 'r1', name: 'My routine' })

      expect(result).toEqual({ ok: true })
      expect(state.routines['r1']).toEqual({ id: 'r1', name: 'My routine', instructions, version: 1 })
    })

    it('rejects saving a routine from a bot with no program assigned', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)

      const result = executeAction(state, botId, { op: 'SAVE_ROUTINE', botId, routineId: 'r1', name: 'x' })

      expect(result).toEqual({ ok: false, reason: 'bot has no program assigned' })
    })
  })

  describe('ASSIGN_ROUTINE', () => {
    it('assigns a saved routine to a bot as a fresh program, resetting its frame stack', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)
      const oldProgram: Program = { id: 'old', name: 'old', version: 1, instructions: [] }
      state.programs[oldProgram.id] = oldProgram
      state.botRuntimes[botId] = createBotRuntime(oldProgram.id, oldProgram)
      const routineInstructions: Instruction[] = [{ id: '1', op: 'MOVE_TO', args: [{ mode: 'absolute', tile: { x: 3, y: 3 } }] }]
      state.routines['r1'] = { id: 'r1', name: 'Routine', instructions: routineInstructions, version: 1 }

      const result = executeAction(state, botId, { op: 'ASSIGN_ROUTINE', botId, routineId: 'r1', programId: 'new' })

      expect(result).toEqual({ ok: true })
      expect(state.botRuntimes[botId]?.programId).toBe('new')
      expect(state.programs['new']).toEqual({ id: 'new', name: 'Routine', instructions: routineInstructions, version: 1 })
      expect(state.botRuntimes[botId]?.frames).toEqual([{ instructions: routineInstructions, index: 0, iterationsLeft: 1 }])
      // Independent of the routine's own instructions from here on.
      expect(state.programs['new']?.instructions).not.toBe(state.routines['r1']?.instructions)
    })

    it('rejects assigning an unknown routine', () => {
      const state = createWorld(5, 5, 1)
      const botId = addBot(state, 0, 0)
      const program: Program = { id: 'p', name: 'p', version: 1, instructions: [] }
      state.programs[program.id] = program
      state.botRuntimes[botId] = createBotRuntime(program.id, program)

      const result = executeAction(state, botId, { op: 'ASSIGN_ROUTINE', botId, routineId: 'missing', programId: 'new' })

      expect(result).toEqual({ ok: false, reason: 'unknown routine' })
    })
  })

  describe('COPY_PROGRAM', () => {
    it('copies one bot’s program to another as a fresh, independent program instance', () => {
      const state = createWorld(5, 5, 1)
      const fromBotId = addBot(state, 0, 0)
      const toBotId = addBot(state, 1, 0)
      const instructions: Instruction[] = [{ id: '1', op: 'MOVE_TO', args: [{ mode: 'absolute', tile: { x: 2, y: 2 } }] }]
      const sourceProgram: Program = { id: 'source', name: 'source', version: 1, instructions }
      const targetProgram: Program = { id: 'target', name: 'target', version: 1, instructions: [] }
      state.programs[sourceProgram.id] = sourceProgram
      state.programs[targetProgram.id] = targetProgram
      state.botRuntimes[fromBotId] = createBotRuntime(sourceProgram.id, sourceProgram)
      state.botRuntimes[toBotId] = createBotRuntime(targetProgram.id, targetProgram)

      const result = executeAction(state, fromBotId, { op: 'COPY_PROGRAM', fromBotId, toBotId, programId: 'copied' })

      expect(result).toEqual({ ok: true })
      expect(state.botRuntimes[toBotId]?.programId).toBe('copied')
      expect(state.programs['copied']).toEqual({ id: 'copied', name: 'source', instructions, version: 1 })
      expect(state.programs['copied']?.instructions).not.toBe(sourceProgram.instructions)
    })

    it('rejects copying when either bot has no program assigned', () => {
      const state = createWorld(5, 5, 1)
      const fromBotId = addBot(state, 0, 0)
      const toBotId = addBot(state, 1, 0)

      const result = executeAction(state, fromBotId, { op: 'COPY_PROGRAM', fromBotId, toBotId, programId: 'copied' })

      expect(result).toEqual({ ok: false, reason: 'both bots must have a program assigned' })
    })
  })
})
