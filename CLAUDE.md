# Automation Game — agent instructions

A 2D tile-based automation game. The player performs tasks by hand, records them,
and hands the recording to a robot that replays it forever. The player can then
edit the recording as an instruction list.

## Stack

TypeScript (strict) · Vite · Canvas2D (no game framework) · plain DOM for UI ·
Vitest · tsx for the headless runner · pnpm.

Do not add dependencies without being asked. In particular: no Phaser, no PixiJS,
no React, no state-management library, no ECS library.

## Verify before you claim anything is done

```
pnpm verify        # tsc --noEmit && eslint . && vitest run
```

It must be green. Never mark a task complete without pasting a green run into your
summary. If you cannot get it green, say so plainly rather than narrowing the test.

## Architecture rules — do not break these

1. `src/sim/` must never import from `src/render/`, `src/ui/` or `src/input/`.
   The simulation is portable to another engine; the renderer is not.
2. `Math.random()` and `Date.now()` are banned inside `src/sim/`. Use `src/sim/rng.ts`.
3. All world mutation goes through `executeAction()` in `src/sim/actions.ts`.
   Nothing else writes to `SimState`. The recorder depends on this.
4. Simulation positions are integers. Visual interpolation belongs in the renderer
   and is never fed back into the sim.
5. The simulation runs at a fixed 20 Hz tick, decoupled from render frame rate.
6. Entities iterate in stable id order, never hash-map insertion order.

Both rules 1 and 2 are enforced by ESLint. If a lint rule blocks you, fix the code,
never the rule.

## Design rules

- **Recording captures no timing.** The recorder emits instructions back-to-back as
  the player commits actions. Wall-clock gaps between player actions produce nothing.
  A recorded program contains no `WAIT` and no duration metadata. Replay durations
  come only from the action-cost table in `src/sim/entities.ts`.
- `WAIT` is an editor-only opcode. The player adds it deliberately; recording never
  produces it.
- `REPEAT forever` is a core opcode available to every bot tier including Mk1. It is
  never gated behind an upgrade. The implicit outer `REPEAT forever` that wraps a
  recorded program does not count against a bot's instruction cap.
- Bots that cannot resolve a target look confused and retry. They never throw.

## Conventions

- TypeScript strict. No `any`, no non-null assertions, no `@ts-ignore`.
- Files stay under ~300 lines. Split rather than grow.
- Every new behaviour in `src/sim/` ships with a test in `tests/`.
- For `src/sim/` work, write the test before the implementation.
- Australian spelling in all user-facing strings, comments and docs
  (colour, behaviour, initialise, centre).
- Do not create placeholder or empty files for future milestones.

## Debugging

```
pnpm sim -- --fixture tests/fixtures/<name>.json --ticks 500
```

Runs the simulation headlessly and prints `textDump(state)` — the full world as
readable text. Use this to verify behaviour, not screenshots. Scenario tests in
`tests/scenarios/` compare `textDump` output against snapshots.

## Milestones

Work one milestone at a time, on its own branch. Do not implement anything from a
later milestone. If you think a later milestone's work is needed now, stop and ask.

| # | Milestone |
|---|---|
| M0 | Scaffold, tick loop, seeded RNG, text dump, headless runner, CI |
| M1 | World grid, player movement, camera, renderer, click-to-move |
| M2 | Resources and verbs: chop, mine, pick up, drop, carry. Pathfinding |
| M3 | Machines, containers, minimal crafting UI |
| M4 | Bot entity and the VM, running hand-written JSON programs |
| M5 | Recording player actions into a program |
| M6 | Script editor UI: view, reorder, delete, edit arguments |
| M7 | Control flow, the generalise pass, failure policies |
| M8 | Multiple bots, program library, bot tiers, save/load |
| M9 | Farming chain, progression, tutorial, itch.io build |
