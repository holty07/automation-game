# Agent prompts — Automation Game

One prompt per milestone, written for Claude Code. Full setup and the per-session
loop are in `claude-code-setup.md`.

**The loop, every time:** `/clear` → new branch → paste the prompt (or run
`/milestone M4` once M0b is done) → review with the `sim-reviewer` subagent →
commit. Use plan mode for M4, M6 and M7 only; the rest are specific enough that
planning is just context cost.

The M0 prompt is self-contained: it writes `AGENTS.md` itself, so nothing needs
creating by hand first. Every later prompt assumes `AGENTS.md` exists and Claude has
read it.

---

## M0 — Scaffold

> Paste this into an empty directory. This is the only long prompt.

```
You are scaffolding a new project called Automation Game: a 2D tile-based automation
game where the player records their own actions and hands the recording to a robot
that replays it. This session builds the scaffold only — no gameplay.

Work in the current directory. Create exactly the files listed below and no others.
Do not create empty placeholder files for future work.

## Stack (do not deviate, do not add dependencies)

TypeScript strict, Vite, Canvas2D with no game framework, plain DOM for UI, Vitest,
tsx for a headless runner, pnpm. No Phaser, no PixiJS, no React, no state library.

## Files to create

- AGENTS.md          — content supplied verbatim at the end of this prompt
- CLAUDE.md          — an exact copy of AGENTS.md
- README.md          — one paragraph on what the game is and how to run it
- .gitignore         — node_modules, dist, coverage, test-results, .DS_Store
- package.json       — scripts below
- tsconfig.json      — strict: true, noUncheckedIndexedAccess: true, target ES2022,
                       module/moduleResolution bundler, include src/ scripts/ tests/
- vite.config.ts     — base: './' so the build works on itch.io
- vitest.config.ts   — node environment, include tests/**/*.test.ts
- eslint.config.js   — flat config, typescript-eslint, plus the two rules below
- index.html         — <canvas id="game"> and <div id="ui">
- src/main.ts        — create the world, start the loop, log textDump once on boot
- src/sim/types.ts   — TileType, EntityType, EntityId, TileRef, Entity, SimState
- src/sim/rng.ts     — seeded PRNG (mulberry32): createRng(seed) returning
                       { next(): number, nextInt(max): number, state: number }
- src/sim/world.ts   — createWorld(width, height, seed): SimState, getTile, setTile,
                       addEntity, removeEntity, entitiesAt
- src/sim/tick.ts    — tick(state): void advancing one step and incrementing
                       state.tick; createLoop(state, onFrame) with a fixed-timestep
                       accumulator at 20 Hz decoupled from requestAnimationFrame
- src/sim/serialise.ts — SAVE_VERSION, save(state): string, load(json): SimState,
                       migrate(raw): raw. Throw a clear error on unknown versions
- src/debug/textDump.ts — textDump(state): string. Prints the tick count, the grid
                       as ASCII (one char per tile type), a numbered entity list with
                       positions, and a bot section (empty for now). Must be stable
                       and deterministic: iterate entities in id order
- scripts/sim.ts     — headless runner. Args: --fixture <path> --ticks <n>
                       [--dump-every <n>]. Loads the fixture, runs N ticks, prints
                       textDump. Exits non-zero on error
- tests/fixtures/empty-world.json — a saved 16x16 empty world, seed 1
- tests/sim/rng.test.ts — same seed produces the same sequence; different seeds diverge
- tests/sim/tick.test.ts — 100 ticks on an empty world changes nothing but state.tick
- tests/scenarios/empty-world.test.ts — load the fixture, run 100 ticks, assert
                       textDump matches an inline snapshot
- .github/workflows/verify.yml — on push: pnpm install --frozen-lockfile && pnpm verify

## package.json scripts

  dev        vite
  build      tsc --noEmit && vite build
  typecheck  tsc --noEmit
  lint       eslint .
  test       vitest run
  verify     pnpm typecheck && pnpm lint && pnpm test
  sim        tsx scripts/sim.ts

## The two ESLint rules that must be present, scoped to src/sim/**/*.ts

  'no-restricted-imports': ['error', { patterns: [{
      group: ['**/render/**', '**/ui/**', '**/input/**'],
      message: 'src/sim must not import renderer, UI or input code.' }] }]

  'no-restricted-properties': ['error',
    { object: 'Math', property: 'random',
      message: 'Use src/sim/rng.ts — the sim must be deterministic.' },
    { object: 'Date', property: 'now',
      message: 'The sim must be deterministic.' }]

Prove both rules fire: temporarily add a violating line, confirm eslint errors,
remove it. Report that you did this.

## Done when

- pnpm verify is green. Paste the output.
- pnpm sim -- --fixture tests/fixtures/empty-world.json --ticks 100 prints a text dump.
  Paste the output.
- pnpm dev serves a page with a canvas and no console errors.

## AGENTS.md content — write this file verbatim

[paste the full contents of AGENTS.md here]
```

**Note:** where the prompt says `[paste the full contents of AGENTS.md here]`, paste the
whole `AGENTS.md` file, or attach it and change that line to "AGENTS.md is attached —
write it to the repo root verbatim."

---

## M0b — Wire up Claude Code

> Run this after M0 is green and committed. Separate from M0 on purpose: the verify
> hook would otherwise fire before there is anything to verify.

```
Read AGENTS.md first. Branch: m0b-claude-config.

Set up this repo's Claude Code configuration. Fetch the current Claude Code docs
before writing any of it — check the schema for hooks, skills and subagents rather
than relying on memory. Create four things:

1. .claude/settings.json — a permissions allowlist covering: pnpm install,
   pnpm typecheck, pnpm lint, pnpm test, pnpm verify, pnpm build, pnpm sim *,
   git status, git diff *, git log *, git add *, git commit *, git checkout -b *.
   Do NOT allowlist git push, git reset, or anything that deletes files.
   Also wire the Stop hook described below.

2. .claude/hooks/verify.sh — runs `pnpm verify` and blocks the turn from ending if
   it fails. IMPORTANT: pnpm verify exits 1 on failure but a hook must exit 2 to
   block, so translate the exit code. Print the last ~40 lines of output to stderr
   so the failure is visible. Make it executable. After writing it, tell me how to
   confirm it registered.

3. .claude/skills/milestone/SKILL.md — a manually-invoked command (set
   disable-model-invocation: true) taking a milestone id as $ARGUMENTS. It should:
   read AGENTS.md and the milestone table in docs/automation-game-plan.md section 6;
   read that milestone's prompt in docs/agent-prompts.md and follow it exactly;
   create a branch named after the milestone before making changes; implement
   nothing from a later milestone and stop and ask if later work seems needed;
   run pnpm verify and paste the output before claiming done; then commit.

4. .claude/agents/sim-reviewer.md — a review subagent with tools Read, Grep, Glob,
   Bash that checks a diff for: imports from render/ ui/ input/ inside src/sim/;
   Math.random or Date.now inside src/sim/; unstable iteration order; non-integer
   sim positions; world mutation bypassing executeAction(); missing tests for new
   sim behaviour; and any timing data, timestamp, tick delta or WAIT opcode on a
   recorded instruction. It reports gaps with file and line references, not style
   preferences.

Also create a docs/ directory and move automation-game-plan.md, agent-prompts.md
and claude-code-setup.md into it if they are not already there.

Done when: pnpm verify is still green, /hooks shows the Stop hook registered, and
/milestone appears in the command list.
```

---

## M1 — World and player

```
Read AGENTS.md first. Branch: m1-world. Implement M1 only.

Build the world rendering and player movement.

- src/render/camera.ts — camera that follows a target tile, with tile-to-pixel
  conversion and visible-bounds calculation for culling
- src/render/sprites.ts — placeholder art: solid coloured rounded rects per tile type
  and entity type, drawn procedurally. No image assets yet
- src/render/canvas.ts — draws SimState each animation frame: visible tiles, then
  entities in id order. Owns no state of its own. Reads the sim, never writes to it
- src/input/controls.ts — click a tile to set the player's move target; WASD/arrows
  for direct movement
- src/sim/ — add a player entity, and tile-to-tile movement at a fixed speed.
  Sim position stays integer tile coordinates. The renderer interpolates visually
  between the previous and current tile using the loop's alpha value

Extend textDump to show the player's tile and current move target.

Done when: the player walks around a 64x64 grid, the camera follows, the text dump
shows the correct position, and pnpm verify is green.
```

---

## M2 — Resources and verbs

```
Read AGENTS.md first. Branch: m2-verbs. Implement M2 only.

- src/sim/entities.ts — entity definitions (tree, rock, log, stone, ground items)
  and the ACTION_COSTS table mapping (opcode, target type) to a tick duration
- src/sim/pathfind.ts — BFS over the grid returning a path to a tile adjacent to a
  target. Deterministic tie-breaking: neighbours visited in fixed N,E,S,W order
- src/sim/actions.ts — executeAction(state, actorId, action): ActionResult.
  This is the ONLY function that mutates the world. Supports MOVE_TO, PICK_UP, DROP
  and USE. USE resolves by target type: tree -> log, rock -> stone. Returns a result
  object including any entity produced, so a lastResult register can use it later
- Wire input/controls.ts so player clicks call executeAction

Actions take time: executeAction begins an action with a duration from ACTION_COSTS,
and the tick loop advances it. An actor has at most one in-flight action.

Tests: a scenario test driving chop -> pick up -> drop and asserting the resulting
world state and textDump snapshot.

Done when: the player can chop a tree, carry the log, drop it, the scenario test
passes, and pnpm verify is green.
```

---

## M3 — Machines and containers

```
Read AGENTS.md first. Branch: m3-machines. Implement M3 only.

- src/sim/machines.ts — a container entity (stockpile) with a typed item store, and
  a machine entity (bench saw) with a recipe: 1 log -> 1 plank over N ticks
- Extend actions.ts with TAKE_FROM and GIVE_TO
- src/ui/Toolbar.ts — plain DOM. Shows the held item and a build menu to place a
  stockpile or bench saw on a tile

Extend textDump to list container contents and machine state.

Done when: the player can place a bench saw, feed it a log, collect a plank, and
store it in a stockpile. pnpm verify is green.
```

---

## M4 — The bot VM

```
Read AGENTS.md first. Branch: m4-vm. Implement M4 only.
No recording and no editor UI this milestone — programs are hand-written JSON.

- src/sim/program.ts — Instruction and Program types exactly as specified in the plan:
  Instruction { id, op, args: TargetRef[], children?, elseChildren? }.
  Plus validate(program, tier) and a versioned migrate()
- src/sim/targeting.ts — resolve a TargetRef against SimState. Modes: absolute,
  nearestOf, inArea, held, lastResult, marker. nearestOf must break ties
  deterministically: lowest distance, then lowest entity id
- src/sim/vm.ts — BotRuntime with a frame stack, currentAction, status and
  blockedReason. Per-bot tick procedure exactly as in the plan. Control-flow opcodes
  consume no game time. Failure policies: wait (default), skip, halt
- Bot entity type, placed by the player, assigned a program id

Opcodes this milestone: MOVE_TO, PICK_UP, DROP, USE, TAKE_FROM, GIVE_TO,
REPEAT forever, REPEAT n. REPEAT forever is available at every bot tier.

Extend textDump's bot section: for each bot, its program name, current instruction
path, status and blockedReason.

Tests: tests/fixtures/chop-and-store.json — a world plus a hand-written program.
A scenario test runs it 500 ticks and asserts the exact resulting world state.

Done when: a bot loaded from that fixture chops trees and stores logs indefinitely,
the scenario test passes, and pnpm verify is green.
```

---

## M5 — Recording

```
Read AGENTS.md first. Branch: m5-recording. Implement M5 only.

- src/sim/recorder.ts — taps executeAction. While recording is active, every
  committed player action appends an Instruction to the in-progress program

Critical: recording captures NO timing. Instructions are appended back-to-back as
actions commit. Wall-clock gaps between player actions produce nothing at all. A
recorded program contains no WAIT instruction and no duration metadata. If you find
yourself storing a timestamp or a tick delta on a recorded instruction, that is wrong.

Default binding while recording: absolute for everything. Generalisation comes in M7.

- Toolbar gets Record / Stop, and on stop, an assign-to-bot flow
- Wrap the finished program in REPEAT forever before assigning

Tests: a scenario test that drives player actions through executeAction with the
recorder active, then asserts the resulting Program structure exactly — including
that no WAIT instruction and no timing fields are present.

Done when: recording a chop-and-drop by hand produces a bot that reproduces the same
action sequence, and pnpm verify is green.
```

---

## M6 — Script editor UI

```
Read AGENTS.md first. Branch: m6-editor. Implement M6 only.

Plain DOM, no framework.

- src/ui/InstructionRow.ts — one row: drag handle, opcode label, inline argument
  dropdowns (binding mode, then type or target), and delete / duplicate buttons
- src/ui/ScriptEditor.ts — right-hand panel opened by clicking a bot. Vertical list
  indented by nesting depth. Drag to reorder, including into and out of REPEAT blocks.
  Live execution highlight on the currently executing instruction. Instruction counter
  against the bot's cap, red when over. The implicit outer REPEAT forever is shown but
  does not count toward the cap
- src/ui/BotList.ts — list of bots with status, click to focus and open the editor

Edits apply to the running bot immediately; reset its frame stack on edit.

Add a Playwright smoke test: load the page, open the editor, change a binding mode
from absolute to nearestOf, screenshot.

Done when: the player can change a target's binding mode in the UI and see the bot's
behaviour change, and pnpm verify is green.
```

---

## M7 — Control flow and the generalise pass

```
Read AGENTS.md first. Branch: m7-controlflow. Implement M7 only.

- Editor-only opcodes: REPEAT_UNTIL, IF / ELSE, WAIT. WAIT is only ever added by the
  player in the editor — the recorder must never emit it
- Conditions: HOLDING(type), NOT_HOLDING, EXISTS_NEARBY(type),
  CONTAINER_HAS(container, type), CONTAINER_FULL(container), INVENTORY_FULL
- src/sim/generalise.ts — runs on a freshly recorded program:
  * renewable/ambient resources (trees, rocks, crops, ground items) -> nearestOf
  * buildings, storage, machines -> absolute
  * collapse consecutive MOVE_TO to the same target
  * a PICK_UP immediately followed by a DROP of the same item -> the drop binds to held
  * wrap the whole program in REPEAT forever
  Returns the new program plus a list of changes made
- After recording stops, show the generalised program with changed rows highlighted
  and a one-line summary. Each change is individually undoable
- Per-bot failure policy selector in the editor: wait (default), skip, halt

Tests: unit tests per generalise transform, plus a scenario test where a recorded
6-step routine is generalised and then runs 2000 ticks without ever becoming blocked.

Done when: that scenario test passes and pnpm verify is green.
```

---

## M8 — Scale

```
Read AGENTS.md first. Branch: m8-scale. Implement M8 only.

- src/sim/routines.ts — a named program library. Save a bot's program as a routine,
  assign a routine to any bot, copy a program between bots in one click
- Bot tiers Mk1 to Mk4 with instruction caps 8 / 20 / 40 / 100 and the opcode gating
  from the plan. REPEAT forever is available at every tier including Mk1
- CALL opcode at Mk4, with a recursion depth limit
- Full save/load through serialise.ts, including all bots, programs and routines
- Profile with 10+ bots; fix anything that drops below 60fps render

Tests: save a 10-bot world, load it, run 200 ticks on both the original and the
reloaded state, assert the text dumps are identical.

Done when: that test passes and pnpm verify is green.
```

---

## M9 — Game

```
Read AGENTS.md first. Branch: m9-game. Implement M9 only.

- The farming chain: till, sow, grow over time, harvest, mill to flour
- Bot crafting costs and the Mk1-Mk4 upgrade path
- Tutorial prompts: a short contextual hint queue driving the player through
  chop -> craft -> build a bot -> record -> edit
- itch.io build: pnpm build produces a working dist/ with base './'

Done when: a fresh player reaches their first working recorded bot within 10 minutes
with no outside help, and pnpm verify is green.
```

---

## M10 — Blueprints

```
Read AGENTS.md first. Branch: m10-blueprints. Implement M10 only.

- New `blueprint` entity type: BUILD now places a blueprint holding a target
  BuildableType and a material cost, not the finished building outright
- BUILDING_COSTS table (botCosts.ts pattern) for stockpile / benchSaw / mill --
  buildings are no longer free
- Reuse the existing GIVE_TO opcode to deliver materials into a blueprint's
  storage. No new opcode. A blueprint only accepts the item kinds its recipe needs
- stepBlueprints(): once a blueprint's storage covers its full cost, consume the
  cost and replace the blueprint with the finished building at the same position
  and id, mirroring stepMachines in machines.ts
- A player must be able to record TAKE_FROM (stockpile) -> MOVE_TO -> GIVE_TO
  (blueprint) and hand that recording to a bot, which keeps delivering until the
  blueprint completes, then goes idle/confused rather than erroring (no target
  left to deliver to)

Tests: a fixture with a part-stocked blueprint; drive executeAction through a
completing GIVE_TO and assert the blueprint becomes the real building with
materials deducted. A second scenario: a bot running a hand-written REPEAT-forever
delivery program empties a stockpile into an untouched blueprint and completes it
unattended.

Done when: both tests pass and pnpm verify is green.
```
