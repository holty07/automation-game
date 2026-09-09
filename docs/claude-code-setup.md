# Claude Code setup — Automation Game

Everything you need to go from an empty repo to a running milestone loop. Read once, then live in §4.

---

## 1. Install and authenticate

**Install (macOS, Linux, WSL):**

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Verify:**

```bash
claude --version     # prints e.g. 2.1.211 (Claude Code)
claude doctor        # read-only diagnostics: install health, settings errors, warnings
```

Two things worth knowing before you start:

- **Officially supported Linux distributions** are Ubuntu 20.04+, Debian 10+ and Alpine 3.19+. Arch-based distributions including CachyOS are not on that list. The native installer script generally works fine on Arch, but if you hit anything odd, `claude doctor` is the first stop and the npm install is the fallback: `npm install -g @anthropic-ai/claude-code` (Node 22+; it installs the same native binary). Don't use `sudo npm install -g`.
- **Account:** Claude Code needs a Pro, Max, Team, Enterprise or Console account. The free Claude.ai plan doesn't include it. Log in by running `claude` and following the browser prompt.

**Start a session:**

```bash
cd ~/dev/automation-game
claude
```

You'll be asked to trust the folder the first time.

---

## 2. Sessions 0 and 0b — scaffold, then wire up

**Session 0 — run M0.** Paste the M0 prompt from `agent-prompts.md`. Don't use plan mode; that prompt is already a spec, and planning a spec is wasted context. Done when `pnpm verify` is green and the headless runner prints a text dump.

Commit. Then `/clear`.

**Session 0b — wire up `.claude/`.** Paste the M0b prompt. This is deliberately separate from M0, because the verify hook it installs would fire before there's anything to verify.

M0b creates four things:

| Path | What it does |
|---|---|
| `.claude/settings.json` | Permission allowlist for the commands you'll approve a hundred times anyway, plus the Stop hook wiring |
| `.claude/hooks/verify.sh` | Runs `pnpm verify` and exits 2 on failure, which blocks the turn from ending |
| `.claude/skills/milestone/SKILL.md` | `/milestone M4` — loads the milestone spec and starts work on a fresh branch |
| `.claude/agents/sim-reviewer.md` | An adversarial reviewer subagent for the simulation code |

All four are checked into the repo, so they travel with the project.

### What goes in `.claude/settings.json`

Pre-approving these turns roughly forty permission prompts per session into zero, without giving up anything meaningful — every one of them is a read-only or already-reversible operation.

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm install)",
      "Bash(pnpm typecheck)",
      "Bash(pnpm lint)",
      "Bash(pnpm test)",
      "Bash(pnpm verify)",
      "Bash(pnpm build)",
      "Bash(pnpm sim *)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(git checkout -b *)"
    ]
  }
}
```

Leave `git push`, `git reset` and anything that deletes files off the list on purpose.

### The verify hook

Have Claude write this rather than hand-copying it — the docs recommend it and Claude knows the current hook schema. The one detail it needs from you: **`pnpm verify` exits 1 on failure, but a hook must exit 2 to block the turn**, so the script has to translate the exit code. After it's written, run `/hooks` to confirm it registered.

Rough shape:

```bash
#!/usr/bin/env bash
# .claude/hooks/verify.sh
if ! output=$(pnpm verify 2>&1); then
  echo "pnpm verify failed:" >&2
  echo "$output" | tail -40 >&2
  exit 2
fi
```

Two caveats. The hook is a strong nudge, not an absolute gate — Claude Code overrides it and ends the turn after 8 consecutive blocks. And it runs on every turn, so if `pnpm verify` ever gets slow, move it to a `/goal` condition instead.

### The `/milestone` command

A skill with `disable-model-invocation: true` so it only fires when you ask for it:

```markdown
---
name: milestone
description: Start work on a numbered project milestone
disable-model-invocation: true
---
Start milestone $ARGUMENTS.

1. Read AGENTS.md and the milestone table in docs/automation-game-plan.md section 6.
2. Read the milestone's prompt in docs/agent-prompts.md and follow it exactly.
3. Create a branch named after the milestone before making any changes.
4. Implement nothing from a later milestone. If later work seems necessary, stop and ask.
5. Run pnpm verify. Paste the output. Do not claim done without it.
6. Commit with a descriptive message.
```

Copy `automation-game-plan.md` and `agent-prompts.md` into `docs/` in the repo so this resolves.

---

## 3. The review subagent

A fresh reviewer that sees the diff but not the reasoning that produced it evaluates the work on its own terms, and because it runs in its own context it doesn't cost you any of yours.

```markdown
---
name: sim-reviewer
description: Reviews simulation code for determinism and architecture violations
tools: Read, Grep, Glob, Bash
model: opus
---
You review changes to the Automation Game simulation. Check only these, and
report gaps rather than style preferences:

1. Does anything in src/sim/ import from render/, ui/ or input/?
2. Is there any Math.random(), Date.now(), or other non-deterministic source
   inside src/sim/?
3. Do entities iterate in stable id order everywhere, never hash-map order?
4. Are sim positions integers, with interpolation confined to the renderer?
5. Does all world mutation go through executeAction()?
6. Does every new behaviour in src/sim/ have a test?
7. For recording work: does any recorded instruction carry timing data,
   a timestamp, a tick delta, or a WAIT opcode? All four are bugs.

Give file and line references. Flag only what affects correctness or the
stated requirements.
```

Invoke it explicitly at the end of a milestone: *"Use the sim-reviewer subagent to review this milestone's diff."*

One thing to watch: a reviewer asked to find gaps will usually find some, even when the work is sound. Chasing every finding leads to over-engineering. Fix what's real, note the rest.

---

## 4. The per-milestone loop

This is the part you'll actually repeat nine times.

```
/clear
```

**1. Fresh context.** Always. This is the single most common cause of a session going bad.

**2. Plan mode, for M4, M6 and M7 only.** Press `Shift+Tab` until the status bar shows plan mode, or start with `claude --permission-mode plan`. Ask for a plan, press `Ctrl+G` to open it in your editor and edit it directly, then approve. For M0–M3, M5, M8 and M9 the prompt is specific enough that planning is just overhead.

**3. Start the milestone.**

```
/milestone M4
```

Or paste the prompt from `agent-prompts.md` directly if you'd rather see exactly what's going in.

**4. Watch the first few tool calls, then leave.** With the verify hook installed you can walk away. Course-correct with `Esc` the moment something looks wrong — early is much cheaper than late.

**5. Review.**

```
Use the sim-reviewer subagent to review this milestone's diff.
```

For general correctness, `/code-review` runs the bundled reviewer over the current diff in a fresh subagent.

**6. Check it yourself.** Run the game. Run `pnpm sim -- --fixture <the milestone's fixture> --ticks 500` and read the dump. Thirty seconds of your own eyes catches things no automated check will.

**7. Commit, merge, `/clear`.**

### When it goes sideways

- **Corrected twice on the same thing?** Stop. `/clear`, and rewrite the prompt with what you just learned. A clean session with a better prompt beats a long session full of failed approaches, every time.
- **Wrong turn a few messages back?** `Esc Esc` or `/rewind` restores conversation and code state. Note that checkpoints only track Claude's file-editing tools — changes made through bash aren't captured, so git remains the real safety net.
- **Milestone genuinely off the rails?** `git reset --hard` and re-run the prompt. The prompts are the source of truth; the transcript isn't.
- **Investigating something open-ended?** Delegate it: *"use subagents to investigate X."* Research reads a lot of files, and you don't want any of that in your implementation context.

### Useful mid-session

| Command | Why |
|---|---|
| `/context` | Confirm CLAUDE.md actually loaded, see what's eating the window |
| `/rename` | Name the session `m4-vm` so `claude --resume` is navigable |
| `claude --continue` | Pick up the last session where you left it |
| `/btw` | Ask a side question without it entering conversation history |
| `/diff` | Review changes without leaving the session |
| `/hooks` | Check the verify hook is registered and firing |

---

## 5. Parallel work with worktrees

From M8 onward there are independent tasks (renderer performance vs. the program library) that can run at the same time. Worktrees give each session an isolated git checkout so edits can't collide — ask Claude to create one, or run separate CLI sessions in each.

Worth resisting before M8. Two agents touching `src/sim/` at once produces merge conflicts in exactly the files where determinism matters most.

---

## 6. Keeping CLAUDE.md honest

`CLAUDE.md` is a symlink to `AGENTS.md` and loads at the start of every session, so it is pure context cost on every single turn. Treat it like code.

The test for each line: **would removing it cause Claude to make a mistake?** If not, cut it. A bloated file is worse than a short one, because important rules get lost in the noise and Claude starts ignoring the file wholesale.

Symptoms and fixes:

- **Claude keeps breaking a rule that's in the file** → the file is too long, or that rule should be a hook or an ESLint rule instead. The architecture rules in this project are already enforced by ESLint precisely for this reason.
- **Claude asks something the file answers** → the phrasing is ambiguous, not missing.
- **One instruction keeps getting skipped** → add "IMPORTANT" to that one line. If you emphasise several, none of them stands out.

Run `/doctor` on the checked-in file occasionally and Claude proposes cuts for anything it could derive from the codebase itself.

Domain detail that's only relevant sometimes — the full instruction-set spec, the generalise-pass rules — belongs in a skill under `.claude/skills/`, loaded on demand, not in CLAUDE.md where it costs tokens on every turn.

---

## 7. Reference

- Claude Code docs: https://code.claude.com/docs/en/overview
- Best practices: https://code.claude.com/docs/en/best-practices
- Hooks: https://code.claude.com/docs/en/hooks-guide
- Skills: https://code.claude.com/docs/en/skills
- Subagents: https://code.claude.com/docs/en/sub-agents
- Worktrees: https://code.claude.com/docs/en/worktrees
