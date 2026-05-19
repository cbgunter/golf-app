#!/usr/bin/env bash
# PostToolUse hook: after any Bash git commit, remind Claude to update CLAUDE.md.
# Receives the tool call JSON on stdin.

INPUT=$(cat)

# Only fire on git commit calls (skip the auto CLAUDE.md update commits)
if echo "$INPUT" | grep -q "git commit" && ! echo "$INPUT" | grep -q "skip claude-md"; then
  echo "A git commit was just made. Please run 'git diff HEAD~1 HEAD' to review what changed, then update CLAUDE.md if any changes affect documented architecture, routes, features, or behaviors. Use [skip claude-md] in the commit message if the CLAUDE.md commit itself triggers this."
fi
