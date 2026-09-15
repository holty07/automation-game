import { addBot, addGroundItem, addPlayer, addRock, addStoneDeposit, addTree, addEntity, createWorld, getEntity, setTile } from './sim/world'
import type { EntityId } from './sim/types'
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
    /** Dev/e2e-test-only: spawns a second bot beside the player, empty program and all — same
     * shortcut as the free starter bot below, for Playwright specs that need a second bot to
     * exist without placing and materially stocking a bot blueprint from scratch. Stripped from
     * production builds — `import.meta.env.DEV` is statically false there, so Vite dead-code-
     * eliminates the assignment entirely. */
    __debugBuildBot?: () => void
    /** Dev/e2e-test-only: drops a tilled-soil-plus-grain pair one tile right of the player, the
     * exact state a real harvest leaves behind — so a Playwright spec can check that clicking it
     * picks up the grain instead of re-sowing, without waiting out a real ~15s wheat-growth timer.
     * Stripped from production builds, same as __debugBuildBot above. */
    __debugSpawnHarvestedPatch?: () => void
    /** Dev/e2e-test-only: plants a fresh, choppable tree one tile north of the player — so a
     * Playwright spec can chop it and click again mid-cooldown without depending on wherever
     * world generation happened to scatter a real one. Stripped from production builds, same as
     * __debugBuildBot above. */
    __debugSpawnTree?: () => void
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
// its script, then Record to teach it a job (see ScriptEditor.ts/Toolbar.ts). Every bot after this
// one is built from a materials-costed blueprint instead (Toolbar's Build Bot button), same as any
// other building — see machines.ts's stepBlueprints.
// (One tile clear of (centre + 1, centre) — the tile the editor e2e spec's hardcoded click targets.)
const starterProgram = instantiateProgram('starter-bot', 'Starter bot', [])
state.programs[starterProgram.id] = starterProgram
const starterBotId = addBot(state, centre - 1, centre)
state.botRuntimes[starterBotId] = createBotRuntime(starterProgram.id, starterProgram)

if (import.meta.env.DEV) {
  window.__debugBuildBot = () => {
    const player = getEntity(state, playerId)
    if (player === undefined) {
      return
    }
    // Two tiles clear of the player, clear of the starter bot at (centre - 1, centre) too.
    const pos = { x: player.pos.x - 3, y: player.pos.y }
    const botId = addBot(state, pos.x, pos.y)
    const programId = `debug-bot-${botId}`
    const program = instantiateProgram(programId, `Bot ${botId}`, [])
    state.programs[programId] = program
    state.botRuntimes[botId] = createBotRuntime(programId, program)
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

  window.__debugSpawnTree = () => {
    const player = getEntity(state, playerId)
    if (player === undefined) {
      return
    }
    addTree(state, player.pos.x, player.pos.y - 1)
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
