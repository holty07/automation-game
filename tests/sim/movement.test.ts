import { describe, expect, it } from 'vitest'
import { addBot, addPlayer, createWorld, getEntity } from '../../src/sim/world'
import { MOVE_TICKS_PER_TILE, stepMovement } from '../../src/sim/movement'
import { createBotRuntime } from '../../src/sim/vm'
import type { Program } from '../../src/sim/program'

describe('movement', () => {
  it('moves one tile every MOVE_TICKS_PER_TILE ticks, x before y', () => {
    const state = createWorld(8, 8, 1)
    const playerId = addPlayer(state, 0, 0)
    const player = getEntity(state, playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    player.moveTarget = { x: 1, y: 1 }

    for (let i = 0; i < MOVE_TICKS_PER_TILE - 1; i += 1) {
      stepMovement(state)
    }
    expect(player.pos).toEqual({ x: 0, y: 0 })

    stepMovement(state)
    expect(player.pos).toEqual({ x: 1, y: 0 })
    expect(player.prevPos).toEqual({ x: 0, y: 0 })
    expect(player.moveTarget).toEqual({ x: 1, y: 1 })

    for (let i = 0; i < MOVE_TICKS_PER_TILE; i += 1) {
      stepMovement(state)
    }
    expect(player.pos).toEqual({ x: 1, y: 1 })
    expect(player.moveTarget).toBeNull()
  })

  it('starts a fresh entity with a full cooldown so every step takes the same time', () => {
    const state = createWorld(8, 8, 1)
    const playerId = addPlayer(state, 0, 0)
    const player = getEntity(state, playerId)
    expect(player?.moveCooldown).toBe(MOVE_TICKS_PER_TILE - 1)
  })

  it('does nothing once the entity has arrived', () => {
    const state = createWorld(8, 8, 1)
    const playerId = addPlayer(state, 2, 2)
    const player = getEntity(state, playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    player.moveTarget = { x: 2, y: 2 }

    stepMovement(state)

    expect(player.pos).toEqual({ x: 2, y: 2 })
    expect(player.moveTarget).toBeNull()
  })

  it('walks through a queued multi-tile path, popping each waypoint on arrival', () => {
    const state = createWorld(8, 8, 1)
    const playerId = addPlayer(state, 0, 0)
    const player = getEntity(state, playerId)
    if (player === undefined) {
      throw new Error('player missing')
    }
    player.moveTarget = { x: 1, y: 0 }
    player.path = [
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]

    for (let i = 0; i < MOVE_TICKS_PER_TILE * 3; i += 1) {
      stepMovement(state)
    }

    expect(player.pos).toEqual({ x: 3, y: 0 })
    expect(player.moveTarget).toBeNull()
    expect(player.path).toEqual([])
  })

  it('freezes a paused bot in place, leaving its move target queued for when it resumes', () => {
    const state = createWorld(8, 8, 1)
    const botId = addBot(state, 0, 0)
    const bot = getEntity(state, botId)
    if (bot === undefined) {
      throw new Error('bot missing')
    }
    const program: Program = { id: 'p', name: 'noop', version: 1, instructions: [] }
    state.programs[program.id] = program
    state.botRuntimes[botId] = createBotRuntime(program.id, program)
    const runtime = state.botRuntimes[botId]
    if (runtime === undefined) {
      throw new Error('runtime missing')
    }
    runtime.paused = true
    bot.moveTarget = { x: 1, y: 0 }

    for (let i = 0; i < MOVE_TICKS_PER_TILE; i += 1) {
      stepMovement(state)
    }
    expect(bot.pos).toEqual({ x: 0, y: 0 })
    expect(bot.moveTarget).toEqual({ x: 1, y: 0 })

    runtime.paused = false
    for (let i = 0; i < MOVE_TICKS_PER_TILE; i += 1) {
      stepMovement(state)
    }
    expect(bot.pos).toEqual({ x: 1, y: 0 })
  })
})
