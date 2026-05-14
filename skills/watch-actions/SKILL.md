---
name: watch-actions
description: Poll GitHub Actions workflow runs for the current branch until all checks reach a terminal state (success or failure).
license: MIT
compatibility: Requires git, gh (GitHub CLI), and Node.js installed.
allowed-tools: Bash(npx agent-actions-review *) Bash(pnpm dlx agent-actions-review *) Bash(yarn dlx agent-actions-review *) Bash(bunx agent-actions-review *) Read Grep Glob
metadata:
  author: petems
  version: "0.1.4"
  homepage: https://github.com/petems/agent-actions-review
---

Poll GitHub Actions workflow runs for the current branch until all checks pass green. This is a read-only skill (no code changes, no commits, no pushes).

Inspired by [pbakaus/agent-reviews](https://github.com/pbakaus/agent-reviews) which does the same for PR review comments.

## Prerequisites

All commands below use `npx agent-actions-review`. If the project uses a different package manager, substitute the appropriate runner (e.g., `pnpm dlx agent-actions-review` for pnpm, `yarn dlx agent-actions-review` for Yarn, `bunx agent-actions-review` for Bun). Honor the user's package manager preference throughout.

## Workflow

### Step 1: Check Current Status

Run `npx agent-actions-review list --json`

This shows all workflow runs for the current branch. Review the output:
- If all runs have `conclusion: "success"`, report "All checks passing" and exit.
- If any runs are failing or in progress, continue to Step 2.

### Step 2: Start Watch

Run `npx agent-actions-review watch --json`

This polls the GitHub Actions API every 30 seconds (configurable with `--interval`) and reports:
- Current status of all workflow runs
- Whether all checks are passing
- Whether the watch timed out

### Step 3: Report Result

When the watch completes, report the result:

**If all passing:**
```
All checks passing. CI is green.
- X workflow runs completed successfully.
```

**If timed out:**
```
Watch timed out after Ns.
Current status: X/Y passing, Z failing, W in progress.

Failing workflows:
- workflow-name (run_id): conclusion
```

For failures, suggest next steps:
- Use `npx agent-actions-review detail <run_id>` to investigate (add `--failures-only --json` for a compact failure-focused payload)
- Use the `/fix-failing-actions` skill to automatically fix issues
- Use `npx agent-actions-review rerun <run_id>` if the failure looks flaky

### Step 4: Re-watch if Runs Still In Progress

If the watch timed out but runs are still in progress (not yet failed or succeeded), go back to Step 2 and restart the watch up to 2 additional times (3 total watch attempts). After 3 attempts, exit with the current status even if runs are still in progress.

This ensures the skill keeps polling when workflows are genuinely still running, while preventing indefinite loops if runs get stuck.
