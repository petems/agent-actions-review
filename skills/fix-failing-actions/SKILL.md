---
name: fix-failing-actions
description: Analyze and fix failing GitHub Actions CI/CD for the current branch. Fetches failures, diagnoses root causes, applies fixes, pushes, and watches until green.
license: MIT
compatibility: Requires git, gh (GitHub CLI), and Node.js installed.
allowed-tools: Bash(npx agent-actions-review *) Bash(pnpm dlx agent-actions-review *) Bash(yarn dlx agent-actions-review *) Bash(bunx agent-actions-review *) Bash(git config *) Bash(git add *) Bash(git commit *) Bash(git push *) Bash(npm run *) Bash(npx *) Bash(pnpm run *) Bash(yarn run *) Bash(bun run *) Read Edit Write Grep Glob
metadata:
  author: petems
  version: "0.1.0"
  homepage: https://github.com/petems/agent-actions-review
---

Automatically diagnose and fix failing GitHub Actions workflows on the current branch. Uses a two-phase workflow: fix all existing failures, then poll until all checks pass green.

Inspired by [pbakaus/agent-reviews](https://github.com/pbakaus/agent-reviews) which does the same for PR review comments.

## Prerequisites

All commands below use `npx agent-actions-review`. If the project uses a different package manager, substitute the appropriate runner (e.g., `pnpm dlx agent-actions-review` for pnpm, `yarn dlx agent-actions-review` for Yarn, `bunx agent-actions-review` for Bun). Honor the user's package manager preference throughout.

**Cloud environments only** (e.g., Codespaces, remote agents): verify git author identity so CI checks can map commits to the user. Run `git config --global --get user.email` and if empty or a placeholder, set it manually. Skip this check in local environments.

## Phase 1: DIAGNOSE & FIX (synchronous)

### Step 1: Fetch Failing Runs

Run `npx agent-actions-review list --status failure --json`

The CLI auto-detects the current branch, finds associated workflow runs, and authenticates via `gh` CLI or environment variables. If anything fails (no token, no repo, CLI not installed), it exits with a clear error message.

If zero failing runs are returned, check for in-progress runs:
`npx agent-actions-review list --status in_progress --json`

If everything is green, print "All checks passing" and exit.

### Step 2: Get Failure Details

For each failing run, get the detailed breakdown:

Run `npx agent-actions-review detail <run_id> --json`

This returns:
- The run metadata (workflow name, branch, SHA)
- All jobs and their steps
- Failing steps identified
- Log error excerpts for each failing job
- Automatic categorization: FIXABLE, FLAKY, INFRA, or UNKNOWN

### Step 3: Process Each Failure

For each failure from the detail output:

#### A. Evaluate the Failure

Use the automatic `category` field as a starting point, then read the log errors and referenced code to determine:

1. **FIXABLE** - A code or configuration issue you can fix
2. **FLAKY** - An intermittent failure that should be re-run
3. **INFRA** - A runner or GitHub infrastructure issue (report to user)
4. **UNKNOWN** - Cannot determine, ask the user

**Likely FIXABLE:**
- Test failures: assertion errors, failing test suites
- Lint errors: ESLint, Prettier, style violations
- Build errors: TypeScript errors, compilation failures, missing imports
- Dependency errors: lockfile out of sync, missing packages

**Likely FLAKY:**
- Timeouts, network errors, DNS resolution failures
- Rate limits (429), service unavailable (503)
- Intermittent connection resets

**Likely INFRA:**
- Out of memory, no disk space, runner provisioning failures
- Segmentation faults in CI tooling
- GitHub Actions service issues

**When UNKNOWN, ask the user:**
- The failure relates to business logic or environment-specific config
- Multiple valid interpretations exist
- The fix would require architectural changes

#### B. Act on Evaluation

**If FIXABLE:** Read the relevant source code. Apply the fix. Track the run ID and a brief description.

**If FLAKY:** Re-run the workflow:
Run `npx agent-actions-review rerun <run_id>`
Track as re-run.

**If INFRA:** Report to the user. Cannot fix from code.

**If UNKNOWN:** Ask the user. If they say skip, track it as skipped.

Do NOT watch yet. Watching happens after all fixes are committed (Step 5).

### Step 4: Commit and Push

After processing ALL failing runs:

1. Run the project's lint and type-check if applicable
2. Stage, commit, and push:
   ```bash
   git add -A
   git commit -m "fix: resolve CI failures

   {List of fixes applied, grouped by workflow}"
   git push
   ```
3. Capture the commit hash from the output.

### Step 5: Watch for Green

Run `npx agent-actions-review watch --json`

This polls until all workflow runs pass green or times out.

---

## Phase 2: HANDLE NEW FAILURES (loop)

### Step 6: Check Watch Result

After the watch command completes, check the output:

- **If all passing** (`allPassing: true`): Move to the Summary Report.

- **If timed out with failures** (`timedOut: true`):
  1. Run `npx agent-actions-review list --status failure --json` to get current failures
  2. Process them using Steps 2-5 (diagnose, fix, commit, push, watch)
  3. Repeat Step 6

- **Repeat until all checks pass or the user intervenes.** There is no hard cycle limit. Keep diagnosing, fixing, pushing, and watching as long as new actionable failures appear. If the same failure persists unchanged across two consecutive cycles (identical error, same file, same line), stop and ask the user for guidance rather than retrying the same fix.

---

## Summary Report

After all phases complete, provide a summary:

```text
## CI/CD Fix Summary

### Results
- Fixed: X issues
- Re-run (flaky): X workflows
- Infra issues: X (reported)
- Skipped: X

### By Workflow
#### build-and-test
- Test failure in src/utils.test.js: fixed assertion - Fixed in abc1234
- Lint error in src/index.js: missing semicolon - Fixed in abc1234

#### deploy-preview
- Flaky timeout in deploy step - Re-run triggered

### Status
All checks passing. CI is green.
```

## Important Notes

### Response Policy
- Provide clear rationale for every action taken
- For re-runs, explain why the failure appears flaky
- For skipped items, document the reason

### User Interaction
- Ask the user when uncertain about a failure
- Don't guess on environment-specific or business logic issues
- It's better to ask than to make a wrong fix

### Best Practices
- Read log errors carefully before attempting a fix
- Keep fixes minimal and focused (don't refactor unrelated code)
- Ensure lint and type-check pass before committing
- Group related fixes into a single commit per cycle
- For test failures, read both the test file and the source code
- For build errors, check recent changes that might have introduced the issue
