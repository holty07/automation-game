# Automation Game — Full Build Plan

**Name:** Automation Game (working)
**Repo slug:** `automation-game`
**Concept:** A calm, top-down, tile-based automation game. The player performs tasks by hand, records those actions, and hands the recording to a robot. The robot replays the recording forever. The player can then open the recording as an editable instruction list and refine it.

**Reference point:** Autonauts (Denki, 2019). Its robots are controlled through a visual programming language inspired by Scratch. We are building the same idea at a much smaller scope, with a flat action-list editor rather than a full block language.

---

## 1. Platform decision

### The constraint that matters

This is being built by coding agents, not by hand. The determining factor is not raw engine capability — every option can render a tile grid — it is whether the agent can read the whole project as text and verify its own work without you.

That eliminates Unity and Unreal (binary scenes, GUIDs, editor-only logic). It leaves Godot and the web stack.

### Chosen stack

```
TypeScript (strict)   language
Vite                  dev server + build
Canvas2D              world renderer — no framework
Plain DOM + CSS       all UI, including the script editor
Vitest                unit + scenario replay tests
tsx                   headless simulation runner
Playwright            screenshot smoke tests (added at M6)
pnpm                  package manager
```

**Why not Phaser:** Phaser 4 shipped April 2026 with a rewritten renderer and breaking import changes. Models will confidently write Phaser 3 into a Phaser 4 project. For a tile grid you don't need a framework — a Canvas2D renderer is ~350 lines with zero version drift, and every model knows the Canvas 2D API cold. Add PixiJS behind the same renderer interface only if profiling at M8 demands it.

**Why not Godot (the close call):** Two reasons specific to this game. The instruction-list editor is the hardest UI in the project and DOM makes it trivial where Control nodes make it a grind. And the agent verification loop is tighter on web — typecheck, lint, unit tests and a headless simulation replay in about two seconds, with no editor process and no display server. Godot remains the right call later if you want native desktop performance or controller support; the architecture in section 4 keeps that port to "rewrite the renderer and UI, keep the simulation".

**No React initially.** Add Preact only if the editor UI genuinely demands it.

**Distribution:** browser build → itch.io → Tauri wrapper if you ever want a Steam page.

---

## 2. Game design

### Core loop

1. Player does a task by hand (chop tree → carry log → drop in stockpile).
2. Player builds a bot.
3. Player records the task and assigns it to the bot.
4. Bot repeats it forever, badly.
5. Player opens the bot's instruction list and fixes it — changes a target from "this specific tree" to "nearest tree", adds a condition.
6. Freed-up player time goes into the next tier of task.
7. Repeat until the base runs itself.

The satisfaction is in step 5. Everything else exists to make step 5 happen.

### World

- Fixed 64×64 tile grid. No procedural generation in v1.
- Tile types: grass, dirt, tilled soil, water, stone, sand.
- Entities sit on tiles: trees, rocks, bushes, crops, buildings, ground items, the player, bots.
- One blocking entity per tile. Ground items stack.

### Resource chains (v1 scope — deliberately tiny)

```
Tree          --chop-->      Log
Log           --bench saw--> Plank
Rock          --mine-->      Stone
Stone         --bench saw--> Block
Soil          --till-->      Tilled soil
Tilled soil   --sow-->       Seedling --time--> Wheat
Wheat         --harvest-->   Grain
Grain         --mill-->      Flour
Plank + Block + Flour -->    Bot Mk1
```

Enough to demand automation, small enough to finish.

### Bot tiers

Bots are gated by **instruction capacity** and **available opcodes**. `REPEAT forever` is a core opcode available to every bot from Mk1 — it is the mechanic that makes automation work at all, so it is never a gated upgrade.

| Tier | Cost | Max instructions | Opcodes unlocked |
|---|---|---|---|
| **Mk1** | 4 planks, 2 blocks | 8 | `MOVE_TO`, `PICK_UP`, `DROP`, `USE`, `REPEAT forever` |
| **Mk2** | + 2 gears | 20 | + `TAKE_FROM`, `GIVE_TO`, `REPEAT n`, `WAIT` |
| **Mk3** | + 1 circuit | 40 | + `IF` / `ELSE`, `REPEAT_UNTIL` |
| **Mk4** | + 1 core | 100 | + `CALL` (run a saved routine) |

The implicit outer `REPEAT forever` that wraps every recorded program does **not** count against the instruction cap. Nested repeats the player adds manually do.

### Explicit non-goals for v1

No combat, no day/night, no weather, no colonists, no research tree, no multiplayer, no procedural worlds, no audio beyond placeholder blips.

---

## 3. The record-and-replay system

The heart of the game. Most of the design risk lives here.

### Principle: record intents, not inputs

Never record mouse coordinates or keypresses. Record **semantic actions** at the moment the simulation commits to them. A player clicking a tree does not produce `CLICK(412, 88)` — it produces `USE(tree#17)`.

Every player action already flows through a single `executeAction()` function in the simulation. The recorder is a tap on that function. Recording is therefore nearly free to implement, and a recorded program is by construction always a legal program.

### Recording is timeless

**Recording captures no timing whatsoever.** The recorder emits instructions back-to-back as the player commits actions. Wall-clock gaps between the player's actions — thinking time, walking around, opening a menu, going to make a coffee — produce nothing. There is no `WAIT` opcode in a recorded program and no duration metadata on any recorded instruction.

Action durations at replay time come exclusively from the action-cost table in `sim/actions.ts`. A bot chopping a tree takes the tree's chop duration, regardless of how long the player dithered.

`WAIT` exists, but it is editor-only: the player adds it deliberately when they want a bot to pace itself (waiting on a crop to grow, staggering two bots sharing a machine). It is never produced by recording.

### Instruction set

**Recordable opcodes** — emitted by the recorder from player actions:

| Opcode | Args | Effect |
|---|---|---|
| `MOVE_TO` | target | Walk to a tile adjacent to target |
| `PICK_UP` | target | Take item into hands |
| `DROP` | target (tile or container) | Put held item down |
| `USE` | target | Apply held tool to target (chop, mine, till, sow, harvest) |
| `TAKE_FROM` | container, itemType, count | Withdraw from storage |
| `GIVE_TO` | container | Deposit held item |

**Editor-only opcodes** — added by the player in the editor, never recorded:

| Opcode | Args | Effect |
|---|---|---|
| `REPEAT` | `forever` \| count | Loop a block. `forever` available on all tiers |
| `REPEAT_UNTIL` | condition | Loop a block until condition true |
| `IF` / `ELSE` | condition | Branch |
| `WAIT` | ticks | Idle for a fixed number of ticks |
| `CALL` | routineId | Run a saved routine inline (Mk4) |

**Conditions:** `HOLDING(type)`, `NOT_HOLDING`, `EXISTS_NEARBY(type)`, `CONTAINER_HAS(container, type)`, `CONTAINER_FULL(container)`, `INVENTORY_FULL`.

### Target binding — the design crux

A recorded action points at a specific thing. Replayed literally, the bot chops the same stump forever. Every game in this genre must solve this. The solution is a **binding mode** on every target reference:

```ts
type TargetRef =
  | { mode: 'absolute';  tile: { x: number; y: number } }           // that exact chest
  | { mode: 'nearestOf'; entityType: EntityType; radius?: number }  // nearest tree
  | { mode: 'inArea';    entityType: EntityType; areaId: string }   // nearest tree in a painted zone
  | { mode: 'held' }                                                // whatever is in hand
  | { mode: 'lastResult' }                                          // output of the previous instruction
  | { mode: 'marker';    markerId: string };                        // player-stamped named location
```

### The generalise pass

After the player stops recording, do **not** hand them the raw list. Normalise first, then show the result with the changes highlighted:

- Renewable/ambient resources (trees, rocks, crops, loose items) → `nearestOf`
- Buildings, storage, machines → `absolute` (the player meant *that* chest)
- Consecutive `MOVE_TO` to the same target → collapsed into one
- A `PICK_UP` immediately followed by a `DROP` of the same item → the drop's item binds to `held`
- The whole program → wrapped in `REPEAT forever`

Then show a one-line summary of what changed and let the player undo any of it. This pass is what makes the mechanic feel like magic instead of feeling broken.

### Program data model

```ts
interface Instruction {
  id: string;                    // stable uuid — the editor's drag handle
  op: Opcode;
  args: TargetRef[];
  children?: Instruction[];      // REPEAT / REPEAT_UNTIL / IF
  elseChildren?: Instruction[];  // IF only
}

interface Program {
  id: string;
  name: string;
  instructions: Instruction[];
  version: number;               // bump on schema change, migrate on load
}
```

A tree, not a flat list, so nesting is structural rather than a matched BEGIN/END pair the editor must validate.

### The virtual machine

```ts
interface BotRuntime {
  programId: string;
  frames: Frame[];        // call stack: { instructions, index, iterationsLeft }
  currentAction: {
    op: Opcode;
    resolvedTarget: EntityId | TileRef | null;
    ticksRemaining: number;
  } | null;
  status: 'running' | 'blocked' | 'halted';
  blockedReason?: string;
}
```

**Tick procedure** — per bot, in stable id order, at a fixed 20 Hz:

1. If `currentAction` exists and `ticksRemaining > 0` → decrement, return.
2. If `currentAction` just completed → apply its world effect, store its output in the `lastResult` register, clear it.
3. Fetch the next instruction from the top frame. Control-flow opcodes push/pop frames and consume no game time.
4. Resolve every `TargetRef` against current world state.
5. If resolution fails → apply the failure policy.
6. Otherwise begin the action, with duration taken from the action-cost table.

**Failure policy** — per bot, player-selectable, default *Wait*:

- **Wait** — bot idles, shows a thought bubble naming what's missing, retries every second.
- **Skip** — jump to the next instruction. Useful for opportunistic routines.
- **Halt** — stop and flag the bot for attention. Useful for debugging.

A bot that cannot find a tree should look confused, not throw an error.

### The editor UI

Right-hand side panel, opened by clicking a bot:

- Vertical list of instruction rows, one per line, indented by nesting depth.
- Drag handle per row for reordering.
- Each argument renders as an inline dropdown: binding mode, then type/target. Changing "this tree" to "nearest tree" is two clicks.
- Row actions: delete, duplicate, wrap in repeat.
- "Add instruction" button with a palette filtered by the bot's tier.
- **Live execution highlight** — the currently executing row is highlighted while the bot runs. This alone makes debugging intuitive.
- Instruction counter against the bot's cap, red when over.
- Buttons: Record over, Save as routine, Copy program to another bot.

Programs are named, saved to a library, and assignable to any bot. Copying a proven routine to ten bots is the core power fantasy — one click.

---

## 4. Technical architecture

### Hard rule: the simulation never imports the renderer

If `src/sim/` ever imports from `src/render/`, `src/ui/` or `src/input/`, the architecture is broken and the Godot port becomes impossible. This is enforced by an ESLint rule from M0, not by discipline.

### Determinism

Non-negotiable, because it is what makes the game testable:

- Fixed 20 Hz simulation tick, decoupled from render frame rate via an accumulator.
- All sim positions are integers. Visual interpolation between tiles is a render concern, never fed back into the sim.
- Entities iterate in stable id order, never hash-map insertion order.
- One seeded PRNG in `sim/rng.ts`. `Math.random()` and `Date.now()` are banned in `src/sim/` by ESLint rule.
- Consequence: a save file plus a tick count fully determines world state. Every bug report is reproducible and every test is a replay.

### Saving

Save = `JSON.stringify` of sim state. Programs are plain data, so they double as the share/import format — players can paste routines to each other for free. Version every schema; write a migration on every change, from the first save onward.

---

## 5. Exact file manifest

### M0 creates exactly these files, and no others

Do not create empty placeholder files for later milestones.

| Path | Purpose |
|---|---|
| `AGENTS.md` | Agent instructions. Content supplied verbatim in the kickoff prompt |
| `CLAUDE.md` | Copy of `AGENTS.md` |
| `README.md` | One paragraph: what the game is, how to run it |
| `.gitignore` | `node_modules`, `dist`, `.DS_Store`, `coverage`, `test-results` |
| `package.json` | Scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `verify`, `sim` |
| `tsconfig.json` | `strict: true`, `noUncheckedIndexedAccess: true`, `target: ES2022`, `moduleResolution: bundler` |
| `vite.config.ts` | Default web config, `base: './'` for itch.io |
| `vitest.config.ts` | Node environment, includes `tests/**/*.test.ts` |
| `eslint.config.js` | Flat config. Includes the two architecture rules below |
| `index.html` | Canvas element + `#ui` root div |
| `src/main.ts` | Entry: create sim state, start the tick loop, log the text dump |
| `src/sim/types.ts` | `TileType`, `EntityType`, `EntityId`, `TileRef`, `SimState`, `Entity` |
| `src/sim/rng.ts` | Seeded PRNG (mulberry32). `createRng(seed)` → `{ next(), nextInt(max), state }` |
| `src/sim/world.ts` | `createWorld(width, height, seed): SimState`, `getTile`, `setTile`, `addEntity`, `removeEntity`, `entitiesAt` |
| `src/sim/tick.ts` | `tick(state): void` — advances one sim step. `createLoop(state, onFrame)` — fixed-timestep accumulator at 20 Hz |
| `src/sim/serialise.ts` | `save(state): string`, `load(json): SimState`, `SAVE_VERSION`, `migrate()` |
| `src/debug/textDump.ts` | `textDump(state): string` — full readable state: tick count, grid as ASCII, entity list, bot list with current instruction and status |
| `scripts/sim.ts` | Headless runner: `--fixture <path> --ticks <n> [--dump-every <n>]`, prints text dump |
| `tests/fixtures/empty-world.json` | A saved 16×16 empty world, seed 1 |
| `tests/sim/rng.test.ts` | Same seed → same sequence; different seeds diverge |
| `tests/sim/tick.test.ts` | 100 ticks on an empty world leaves state unchanged except `tick` |
| `tests/scenarios/empty-world.test.ts` | Load fixture, run 100 ticks, assert `textDump` matches an inline snapshot |
| `.github/workflows/verify.yml` | Runs `pnpm install --frozen-lockfile && pnpm verify` on push |

### The two ESLint rules that must be present

```js
// applied to files: ['src/sim/**/*.ts']
'no-restricted-imports': ['error', {
  patterns: [{
    group: ['**/render/**', '**/ui/**', '**/input/**'],
    message: 'src/sim must not import renderer, UI or input code.',
  }],
}],
'no-restricted-properties': ['error',
  { object: 'Math', property: 'random', message: 'Use src/sim/rng.ts — the sim must be deterministic.' },
  { object: 'Date',  property: 'now',    message: 'The sim must be deterministic.' },
],
```

### Full target tree (populated across all milestones)

```
automation-game/
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── eslint.config.js
├── index.html
├── .github/workflows/verify.yml
├── scripts/
│   └── sim.ts                    M0  headless runner
├── src/
│   ├── main.ts                   M0
│   ├── sim/
│   │   ├── types.ts              M0
│   │   ├── rng.ts                M0
│   │   ├── world.ts              M0
│   │   ├── tick.ts               M0
│   │   ├── serialise.ts          M0
│   │   ├── entities.ts           M2  entity definitions, action-cost table
│   │   ├── actions.ts            M2  executeAction() — the single mutation funnel
│   │   ├── pathfind.ts           M2  BFS on the grid
│   │   ├── machines.ts           M3  recipes, containers
│   │   ├── program.ts            M4  Instruction/Program types, validation, migration
│   │   ├── targeting.ts          M4  TargetRef resolution
│   │   ├── vm.ts                 M4  BotRuntime, per-bot tick procedure
│   │   ├── recorder.ts           M5  taps executeAction
│   │   ├── generalise.ts         M7  post-recording normalisation
│   │   └── routines.ts           M8  saved program library
│   ├── render/
│   │   ├── canvas.ts             M1
│   │   ├── camera.ts             M1
│   │   └── sprites.ts            M1
│   ├── ui/
│   │   ├── Toolbar.ts            M3
│   │   ├── BotList.ts            M6
│   │   ├── ScriptEditor.ts       M6
│   │   └── InstructionRow.ts     M6
│   ├── input/
│   │   └── controls.ts           M1
│   └── debug/
│       └── textDump.ts           M0
└── tests/
    ├── sim/
    ├── scenarios/
    └── fixtures/
```

---

## 6. Build phases

Each milestone ends in something playable and has a single testable acceptance criterion. Do not start the next until the current one passes `pnpm verify`.

| # | Milestone | Deliverable | Acceptance criterion |
|---|---|---|---|
| **M0** | Scaffold | Everything in the manifest above | `pnpm verify` green; `pnpm sim -- --fixture tests/fixtures/empty-world.json --ticks 100` prints a text dump |
| **M1** | World & player | Grid renders, player walks tile-to-tile, camera follows, click-to-move | Player traverses the map; text dump shows correct position |
| **M2** | Verbs | Trees, rocks, ground items. Chop, mine, pick up, drop, carry. Action-cost table. BFS pathfinding | A test drives `executeAction` through chop → pick up → drop and asserts world state |
| **M3** | Machines | Bench saw (logs→planks), stockpile container, minimal crafting UI | Player hand-crafts a plank and stores it |
| **M4** | The VM | Bot entity, `BotRuntime`, executes a **hand-written JSON program**. No recording, no editor | A fixture program runs 500 ticks headlessly and produces exactly the expected world state |
| **M5** | Recording | Record button, recorder taps `executeAction`, program assigned to a bot. No timing captured | Record a chop-and-drop by hand; bot reproduces the action sequence identically |
| **M6** | Editor UI | Instruction list panel, reorder, delete, edit args, live execution highlight | Player changes a target's binding mode and sees the bot's behaviour change |
| **M7** | Control flow & generalise | `REPEAT`, `REPEAT_UNTIL`, `IF`/`ELSE`, `WAIT`, the generalise pass, failure policies | A recorded 6-step routine, auto-generalised, runs indefinitely with no player intervention |
| **M8** | Scale | Multiple bots, program library, copy-to-bot, bot tiers, save/load, Playwright smoke test | 10 bots run different programs at 60fps; save and reload is byte-identical |
| **M9** | Game | Farming chain, bot crafting costs, tutorial prompts, itch.io build | A new player reaches their first working bot within 10 minutes unaided |

**M4 before M5 is deliberate.** Build the machine that runs programs before the machine that writes them. Building recording first means debugging two unproven systems against each other.

---

## 7. Running this with Claude Code

Full setup and per-session workflow is in `claude-code-setup.md`. The short version of why this plan is shaped the way it is:

### The constraint the whole plan is built around

Claude Code's context window is the limiting resource, and quality degrades as it fills — <cite index="63-1">a single debugging session or codebase exploration can generate tens of thousands of tokens, and as the window fills Claude may start "forgetting" earlier instructions or making more mistakes</cite>. Every structural decision in this plan exists to keep sessions short and self-verifying: one milestone per session, files under 300 lines, a text dump instead of screenshots, and a single `pnpm verify` command that returns a hard pass or fail.

### The verification loop is the whole game

<cite index="63-1">Claude stops when the work looks done. Without a check it can run, "looks done" is the only signal available, and you become the verification loop. Give Claude something that produces a pass or fail and the loop closes on its own — Claude does the work, runs the check, reads the result, and iterates until it passes.</cite>

That check is `pnpm verify`, and this project makes it unusually strong: the type checker catches interface drift, the ESLint rules catch architecture violations, and the scenario tests catch simulation regressions by comparing a text dump against a snapshot. A green verify on this repo means considerably more than it does on a typical project.

Three ways to enforce it, in increasing order of strictness:

1. **In the prompt** — every milestone prompt in `agent-prompts.md` ends with "done when `pnpm verify` is green, paste the output".
2. **As a `/goal`** — a separate evaluator re-checks the condition after every turn and Claude keeps working until it resolves.
3. **As a Stop hook** — a script that blocks the turn from ending until verify passes. This is the setting to use for milestones you walk away from. Note that <cite index="63-1">Claude Code overrides the hook and ends the turn after 8 consecutive blocks</cite>, so it is a strong nudge rather than an absolute gate.

### Session discipline

- One milestone per session, one branch per milestone (`m0-scaffold`, `m1-world`, …).
- `/clear` between milestones. <cite index="63-1">Long sessions with irrelevant context reduce performance</cite>.
- Plan mode first for M4, M6 and M7 — the milestones with real design decisions. Skip it for M0–M3, where the prompt is already a spec.
- For anything in `src/sim/`, the test is written before the implementation.
- Commit at every green verify.
- <cite index="63-1">If you have corrected Claude more than twice on the same issue in one session, the context is cluttered with failed approaches — `/clear` and start again with a more specific prompt</cite>. The prompts are the source of truth, not the transcript.

### Give the agent a text view of the game

The single highest-leverage thing in this plan. `textDump(state)` serialises the live world into readable plain text: grid, entity positions, each bot's current instruction and status. The agent then verifies gameplay by reading text rather than squinting at screenshots, and every scenario test is `run(fixture, 500 ticks)` compared against a stored snapshot. This pattern is now standard in agent-built games for exactly this reason.

---

## 8. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Scope creep toward full Autonauts | High | The v1 non-goals list is a contract. Ship M9, then decide |
| Recorded programs feel useless without heavy editing | Medium | The generalise pass is the fix. Playtest it yourself the day M7 lands |
| Editor UI becomes the whole project | Medium | Flat list with indentation, not a Scratch-style canvas. No blocks-with-shapes until v2 |
| Determinism drifts, tests go flaky | Medium | Integer positions, seeded RNG, ESLint enforcement — all from M0. Cheap now, brutal to retrofit |
| Library version drift in agent output | Medium | Minimal dependencies, Canvas2D over Phaser, pinned versions, versions named in `AGENTS.md` |
| Context fills mid-milestone and quality degrades | High | One milestone per session, `/clear` between them, files under 300 lines, subagents for investigation |
| Agent declares done without verifying | Medium | Stop hook running `pnpm verify`; require pasted output in every session summary |
| Performance with many bots | Low | 20 Hz with a few hundred entities is nothing. Profile at M8, not before |

---

## 9. Next steps

1. Create an empty GitHub repo named `automation-game` and clone it.
2. Install Claude Code and run through `claude-code-setup.md` §1–2.
3. Run the **M0 prompt** from `agent-prompts.md`. It is fully self-contained — it writes `AGENTS.md` itself, so nothing needs creating by hand first.
4. Run **M0b** to wire up `.claude/` — the settings, the verify hook, the `/milestone` command and the review subagent.
5. From M1 onward it is the same loop every time: `/clear`, new branch, paste the milestone prompt, review, commit.
6. Before M4, sit down and hand-write the JSON fixture for the first bot program yourself. Designing that one file by hand will surface the instruction-set questions faster than any amount of further planning.
