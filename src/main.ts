import { addBot, addGroundItem, addPlayer, addRock, addStockpile, addStoneDeposit, addTree, addEntity, createWorld, getEntity, setTile } from './sim/world'
import type { EntityId } from './sim/types'
import { BOT_TIER_COSTS } from './sim/botCosts'
import { createSoil, createTilledSoil } from './sim/farming'
import { instantiateProgram } from './sim/routines'
import { createLoop } from './sim/tick'
import { createBotRuntime } from './sim/vm'
import { createRecorder } from './sim/recorder'
import { textDump } from './debug/textDump'
import { createCamera } from './render/camera'
import { render } from './render/canvas'
import { createControls } from './input/controls'
import { createToolbar } from './ui/Toolbar'
import { createBotList } from './ui/BotList'
import { createScriptEditor } from './ui/ScriptEditor'
import { createTutorial } from './ui/Tutorial'
import { createHoverInfo } from './ui/HoverInfo'

declare global {
  interface Window {
    /** Dev/e2e-test-only: stocks a stockpile beside the player with exactly the Mk1 bot cost, so
     * Playwright specs can reach a deployed bot without simulating minutes of real gathering.
     * Stripped from production builds — `import.meta.env.DEV` is statically false there, so Vite
     * dead-code-eliminates the assignment entirely. */
    __debugStockMk1?: () => void
    /** Dev/e2e-test-only: drops a tilled-soil-plus-grain pair one tile right of the player, the
     * exact state a real harvest leaves behind — so a Playwright spec can check that clicking it
     * picks up the grain instead of re-sowing, without waiting out a real ~15s wheat-growth timer.
     * Stripped from production builds, same as __debugStockMk1 above. */
    __debugSpawnHarvestedPatch?: () => void
  }
}

const WORLD_SIZE = 64
const TILE_SIZE = 32
const TREE_COUNT = 70
const ROCK_COUNT = 40
const STONE_DEPOSIT_COUNT = 20
const SOIL_COUNT = 16

const state = createWorld(WORLD_SIZE, WORLD_SIZE, 1)
const centre = Math.floor(WORLD_SIZE / 2)
const playerId = addPlayer(state, centre, centre)

/** Tracks every tile a scattered resource (or the player/starter bot) already occupies, across
 * *all* scatter() calls — trees, rocks, soil and stone deposits used to be scattered independently
 * of one another, so two could land on the same tile (e.g. a rock scattered right on top of a
 * tree). Chopping/mining one then left the other still standing, blocking the tile its own yield
 * had just dropped onto and making that item permanently unreachable. The player's and the starter
 * bot's own tiles are reserved up front so neither ever spawns under a resource either. */
const occupiedTiles = new Set<string>([`${centre},${centre}`, `${centre - 1},${centre}`])

function scatter(count: number, place: (x: number, y: number) => void): void {
  for (let i = 0; i < count; i += 1) {
    const x = state.rng.nextInt(WORLD_SIZE)
    const y = state.rng.nextInt(WORLD_SIZE)
    const key = `${x},${y}`
    if (occupiedTiles.has(key)) {
      continue
    }
    occupiedTiles.add(key)
    place(x, y)
  }
}

scatter(TREE_COUNT, (x, y) => addTree(state, x, y))
scatter(ROCK_COUNT, (x, y) => addRock(state, x, y))
scatter(SOIL_COUNT, (x, y) => addEntity(state, createSoil({ x, y })))
// Stone deposits sit on a stamped 'stone' ground tile so they read as a mineable outcrop, not
// just another rock — see useVerb.ts's useStoneDeposit for why they never run out.
scatter(STONE_DEPOSIT_COUNT, (x, y) => {
  setTile(state, x, y, 'stone')
  addStoneDeposit(state, x, y)
})

// One free bot to start with, right beside the player, empty program and all — click it to open
// its script, then Record to teach it a job (see ScriptEditor.ts/Toolbar.ts), no materials or
// DEPLOY_BOT cost required.
// (One tile clear of (centre + 1, centre) — the tile the editor e2e spec's hardcoded click targets.)
const starterProgram = instantiateProgram('starter-bot', 'Starter bot', [])
state.programs[starterProgram.id] = starterProgram
const starterBotId = addBot(state, centre - 1, centre)
state.botRuntimes[starterBotId] = createBotRuntime(starterProgram.id, starterProgram)

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

  window.__debugSpawnHarvestedPatch = () => {
    const player = getEntity(state, playerId)
    if (player === undefined) {
      return
    }
    const pos = { x: player.pos.x + 1, y: player.pos.y }
    addEntity(state, createTilledSoil(pos))
    addGroundItem(state, 'grain', pos.x, pos.y)
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
const hoverInfo = createHoverInfo(canvas, ui, state, camera, playerId)
const scriptEditor = createScriptEditor(ui, state, toolbar)
const tutorial = createTutorial(ui, state)

/** Opening a bot — from the world (a canvas click) or the list — is always the same: show its
 * script, and tell the tutorial so its final step can complete. */
function openBot(botId: EntityId): void {
  scriptEditor.open(botId)
  tutorial.notifyEditorOpened()
}

const controls = createControls(canvas, state, camera, playerId, toolbar, recorder, openBot)
const botList = createBotList(ui, state, openBot)

createLoop(state, (currentState, alpha) => {
  controls.update()
  toolbar.update()
  botList.update()
  scriptEditor.update()
  tutorial.update()
  hoverInfo.update()
  render(ctx, currentState, camera, playerId, alpha)
})
