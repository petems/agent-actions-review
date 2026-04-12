# agent-actions-review

CLI and agent skills for diagnosing and fixing GitHub Actions CI/CD failures.

Inspired by [pbakaus/agent-reviews](https://github.com/pbakaus/agent-reviews) which does the same for PR review comments. This tool focuses on the CI/CD side: listing failing workflow runs, analyzing logs, applying fixes, and watching until everything goes green.

## Quick Start

```bash
# List workflow runs for current branch
npx agent-actions-review

# Show only failing runs
npx agent-actions-review list --status failure

# Get detailed failure analysis with log errors
npx agent-actions-review detail <run_id>

# Re-run failed jobs
npx agent-actions-review rerun <run_id>

# Watch until all checks pass green
npx agent-actions-review watch
```

## Installation

### As a Claude Code plugin

```bash
claude install petems/agent-actions-review
```

This adds two slash commands:

- `/fix-failing-actions` - Full automated workflow: diagnose failures, fix code, push, watch until green
- `/watch-actions` - Poll until all checks pass (read-only, no code changes)

### As a CLI tool

```bash
npm install -g agent-actions-review
```

Or use without installing:

```bash
npx agent-actions-review
```

## Commands

### `list` (default)

List workflow runs for the current branch.

```bash
agent-actions-review                          # All runs
agent-actions-review list --status failure     # Failing runs only
agent-actions-review list --status in_progress # In-progress runs
agent-actions-review list --json               # JSON output
```

### `detail <run_id>`

Show failing jobs, steps, and log error excerpts for a specific run. Includes automatic failure categorization (FIXABLE, FLAKY, INFRA, UNKNOWN).

```bash
agent-actions-review detail 12345678
agent-actions-review detail 12345678 --json
```

### `logs <job_id>`

Fetch and display job logs, focused on error lines with surrounding context.

```bash
agent-actions-review logs 87654321
agent-actions-review logs 87654321 --json
```

### `rerun <run_id>`

Re-run failed jobs (or the entire workflow with `--all`).

```bash
agent-actions-review rerun 12345678           # Re-run failed jobs only
agent-actions-review rerun 12345678 --all     # Re-run entire workflow
```

### `watch`

Poll workflow runs until all checks pass green or timeout.

```bash
agent-actions-review watch                     # Default: 30s interval, 600s timeout
agent-actions-review watch -i 15 --timeout 300 # Custom: 15s interval, 5 min timeout
agent-actions-review watch --json              # JSON output for agent consumption
```

Watch mode exits with code 0 when all checks pass, or code 1 on timeout.

## Options

| Flag | Short | Description |
|------|-------|-------------|
| `--status <status>` | `-s` | Filter by status: failure, in_progress, success, completed |
| `--branch <name>` | `-b` | Target a specific branch (auto-detects from git) |
| `--pr <number>` | `-p` | Find branch from PR number |
| `--json` | `-j` | Output JSON for scripting/agent consumption |
| `--all` | | Re-run entire workflow (with rerun command) |
| `--interval <N>` | `-i` | Watch poll interval in seconds (default: 30) |
| `--timeout <N>` | | Watch timeout in seconds (default: 600) |
| `--help` | `-h` | Show help |
| `--version` | `-v` | Show version |

## Authentication

The CLI resolves a GitHub token from (in priority order):

1. `GITHUB_TOKEN` environment variable
2. `GH_TOKEN` environment variable
3. `.env.local` file in the repository root
4. `gh auth token` (GitHub CLI)

## Agent Skills

### `/fix-failing-actions`

Full automated workflow:

1. **Fetch** failing runs for the current branch
2. **Analyze** log output to identify root cause
3. **Categorize** as FIXABLE, FLAKY, INFRA, or UNKNOWN
4. **Fix** code/config issues, re-run flaky tests
5. **Commit and push** fixes
6. **Watch** until all checks pass green
7. Loop if new failures appear (max 3 cycles)

### `/watch-actions`

Read-only skill that polls until all checks pass. No code changes, no commits, no pushes. Reports the final status and suggests next steps if failures persist.

## Failure Categories

The `detail` command automatically categorizes failures:

| Category | Description | Action |
|----------|-------------|--------|
| **FIXABLE** | Test failures, lint errors, build errors, dependency issues | Fix the code |
| **FLAKY** | Timeouts, network errors, intermittent failures | Re-run the workflow |
| **INFRA** | OOM, disk space, runner issues | Report to user |
| **UNKNOWN** | Cannot determine | Ask the user |

## Development

```bash
git clone https://github.com/petems/agent-actions-review
cd agent-actions-review
npm install
npm test
```

### Local skill testing

Skills are automatically installed to `.claude/skills/` during `npm install`. They're patched to use the local CLI binary instead of the published npm package.

```bash
# Manually re-install skills after changes
npm run install-skills
```

## Acknowledgments

This project is directly inspired by [pbakaus/agent-reviews](https://github.com/pbakaus/agent-reviews), which pioneered the approach of using CLI tools + Claude Code agent skills to automate GitHub workflows. Where agent-reviews handles PR review comments, agent-actions-review applies the same philosophy to CI/CD failures.

## License

MIT
