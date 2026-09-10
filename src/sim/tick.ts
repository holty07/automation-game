import type { SimState } from './types'
import { stepMovement } from './movement'
import { stepMachines } from './machines'
import { stepCrops } from './farming'
import { stepBots } from './vm'

const TICK_RATE_HZ = 20
const TICK_DURATION_MS = 1000 / TICK_RATE_HZ

export function tick(state: SimState): void {
  state.tick += 1
  stepMovement(state)
  stepMachines(state)
  stepCrops(state)
  stepBots(state)
}

export interface Loop {
  stop(): void
}

export function createLoop(state: SimState, onFrame: (state: SimState, alpha: number) => void): Loop {
  let accumulator = 0
  let lastTime: number | undefined
  let running = true

  function frame(time: number): void {
    if (!running) {
      return
    }
    if (lastTime !== undefined) {
      accumulator += time - lastTime
      while (accumulator >= TICK_DURATION_MS) {
        tick(state)
        accumulator -= TICK_DURATION_MS
      }
    }
    lastTime = time
    onFrame(state, accumulator / TICK_DURATION_MS)
    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)

  return {
    stop(): void {
      running = false
    },
  }
}
