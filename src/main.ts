import { addPlayer, addRock, addStockpile, addTree, addEntity, createWorld, getEntity } from './sim/world'
import { BOT_TIER_COSTS } from './sim/botCosts'
import { createSoil } from './sim/farming'
import { createLoop } from './sim/tick'
import { createRecorder } from './sim/recorder'
import { textDump } from './debug/textDump'
import { createCamera } from './render/camera'
import { render } from './render/canvas'
import { createControls } from './input/controls'
import { createToolbar } from './ui/Toolbar'
import { createBotList } from './ui/BotList'
import { createScriptEditor } from './ui/ScriptEditor'
import { createTutorial } from './ui/Tutorial'

declare global {
  interface Window {
    /** Dev/e2e-test-only: stocks a stockpile beside the player with exactly the Mk1 bot cost, so
     * Playwright specs can reach a deployed bot without simulating minutes of real gathering.
     * Stripped from production builds — `import.meta.env.DEV` is statically false there, so Vite
     * dead-code-eliminates the assignment entirely. */
    __debugStockMk1?: () => void
  }
}

const WORLD_SIZE = 64
const TILE_SIZE = 32
const TREE_COUNT = 24
const ROCK_COUNT = 16
const SOIL_COUNT = 16

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
scatter(SOIL_COUNT, (x, y) => addEntity(state, createSoil({ x, y })))

if (import.meta.env.DEV) {
  window.__debugStockMk1 = () => {
    const player = getEntity(state, playerId)
    if (player === undefined) {
      return
    }
    // Placed well clear of (player.x + 1, player.y) — the tile the editor e2e spec's hardcoded
    // click targets — so stocking materials never turns that click into a TAKE_FROM instead of
    // the plain MOVE_TO the test expects to record.
    const stockpileId = addStockpile(state, player.pos.x - 3, player.pos.y)
    const stockpile = getEntity(state, stockpileId)
    if (stockpile !== undefined) {
      stockpile.storage = { ...BOT_TIER_COSTS.mk1 }
    }
  }
}

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

/** Keeps the canvas' backing resolution matched to the browser window so the play area fills it. */
function resizeCanvas(target: HTMLCanvasElement): void {
  target.width = window.innerWidth
  target.height = window.innerHeight
  camera.viewportWidth = target.width
  camera.viewportHeight = target.height
}

const camera = createCamera(TILE_SIZE, window.innerWidth, window.innerHeight)
resizeCanvas(canvas)
window.addEventListener('resize', () => resizeCanvas(canvas))

const recorder = createRecorder()
const toolbar = createToolbar(ui, state, playerId, recorder)
const controls = createControls(canvas, state, camera, playerId, toolbar, recorder)
const scriptEditor = createScriptEditor(ui, state)
const tutorial = createTutorial(ui, state)
const botList = createBotList(ui, state, (botId) => {
  scriptEditor.open(botId)
  tutorial.notifyEditorOpened()
})

createLoop(state, (currentState, alpha) => {
  controls.update()
  toolbar.update()
  botList.update()
  scriptEditor.update()
  tutorial.update()
  render(ctx, currentState, camera, playerId, alpha)
})
