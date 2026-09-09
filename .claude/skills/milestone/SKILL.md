---
name: milestone
description: Start work on a numbered project milestone (e.g. /milestone M4)
disable-model-invocation: true
---

Start milestone $ARGUMENTS.

1. Read AGENTS.md and the milestone table in `docs/automation-game-plan.md` section 6.
2. Read that milestone's prompt in `docs/agent-prompts.md` and follow it exactly.
3. Create a branch named after the milestone before making any changes.
4. Implement nothing from a later milestone. If work from a later milestone
   seems necessary to proceed, stop and ask rather than doing it.
5. Run `pnpm verify` and paste the output before claiming the milestone done.
   If it isn't green, say so plainly rather than narrowing the test.
6. Commit with a descriptive message.
