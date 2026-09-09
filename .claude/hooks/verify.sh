#!/usr/bin/env bash
# Stop hook: blocks the turn from ending until `pnpm verify` is green.
# pnpm verify exits 1 on failure, but a Stop hook must exit 2 to block —
# this translates the exit code.

if ! output=$(cd "${CLAUDE_PROJECT_DIR:-.}" && pnpm verify 2>&1); then
  echo "pnpm verify failed:" >&2
  echo "$output" | tail -40 >&2
  exit 2
fi

exit 0
