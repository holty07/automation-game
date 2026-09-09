import { addPlayer, addRock, addTree, createWorld } from './sim/world'
import { createLoop } from './sim/tick'
import { createRecorder } from './sim/recorder'
import { textDump } from './debug/textDump'
import { createCamera } from './render/camera'
import { render } from './render/canvas'
import { createControls } from './input/controls'
import { createToolbar } from './ui/Toolbar'

const WORLD_SIZE = 64
const TILE_SIZE = 32
const TREE_COUNT = 24
const ROCK_COUNT = 16

const state = createWorld(WORLD_SIZE, WORLD_SIZE, 1)
const centre = Math.floor(WORLD_SIZE / 2)
const playerId = addPlayer(state, centre, centre)

function scatter(count: number, place: (x: number, y: number) => void): void {
  for (let i = 0; i < count; i += 1) {
    const x = state.rng.nextInt(WORLD_SIZE)
    const y = state.rng.nextInt(WORLD_SIZE)
    if (x === centre && y === centre) {
      continue
    }
    place(x, y)
  }
}

scatter(TREE_COUNT, (x, y) => addTree(state, x, y))
scatter(ROCK_COUNT, (x, y) => addRock(state, x, y))

console.log(textDump(state))

const canvas = document.getElementById('game')
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing #game canvas element.')
}
const ctx = canvas.getContext('2d')
if (ctx === null) {
  throw new Error('Canvas 2D context is unavailable.')
}

const ui = document.getElementById('ui')
if (!(ui instanceof HTMLElement)) {
  throw new Error('Missing #ui element.')
}

const camera = createCamera(TILE_SIZE, canvas.width, canvas.height)
const recorder = createRecorder()
const toolbar = createToolbar(ui, state, playerId, recorder)
const controls = createControls(canvas, state, camera, playerId, toolbar, recorder)

createLoop(state, (currentState, alpha) => {
  controls.update()
  toolbar.update()
  render(ctx, currentState, camera, playerId, alpha)
})
