import { addPlayer, createWorld } from './sim/world'
import { createLoop } from './sim/tick'
import { textDump } from './debug/textDump'
import { createCamera } from './render/camera'
import { render } from './render/canvas'
import { createControls } from './input/controls'

const WORLD_SIZE = 64
const TILE_SIZE = 32

const state = createWorld(WORLD_SIZE, WORLD_SIZE, 1)
const playerId = addPlayer(state, Math.floor(WORLD_SIZE / 2), Math.floor(WORLD_SIZE / 2))

console.log(textDump(state))

const canvas = document.getElementById('game')
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing #game canvas element.')
}
const ctx = canvas.getContext('2d')
if (ctx === null) {
  throw new Error('Canvas 2D context is unavailable.')
}

const camera = createCamera(TILE_SIZE, canvas.width, canvas.height)
const controls = createControls(canvas, state, camera, playerId)

createLoop(state, (currentState, alpha) => {
  controls.update()
  render(ctx, currentState, camera, playerId, alpha)
})
