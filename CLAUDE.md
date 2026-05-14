# CLAUDE.md

## Project

CLI + Agent Skills for diagnosing and fixing GitHub Actions CI/CD failures.
Inspired by [pbakaus/agent-reviews](https://github.com/pbakaus/agent-reviews).

## Structure

```
bin/agent-actions-review.js         CLI entry point
lib/github.js                       Auth, repo detection, proxy fetch
lib/actions.js                      GitHub Actions API, log analysis
lib/format.js                       Terminal output formatting
skills/fix-failing-actions/         Skill: full diagnose-fix-push-watch workflow
skills/watch-actions/               Skill: poll until green (read-only)
.claude-plugin/                     Plugin manifest + marketplace catalog
```

## Key Commands

| Task                   | Command                                               |
| ---------------------- | ----------------------------------------------------- |
| Install skills locally | `npm run install-skills`                              |
| Test CLI locally       | `node bin/agent-actions-review.js`                    |
| Run tests              | `npm test`                                            |
| Lint                   | `npm run lint` (auto-fix: `npm run lint:fix`)         |
| Format                 | `npm run format` (check only: `npm run format:check`) |

## Rules

- No em dashes. Use commas, periods, or parentheses instead.
- Node.js CommonJS throughout (no ESM).
- Version in three places: package.json, .claude-plugin/plugin.json, skills/\*/SKILL.md frontmatter.
- Skills use `npx agent-actions-review` (no bundled scripts).
- Keep CLI output minimal. No status messages, only results.
- Changelog entries brief, one list item per feature/fix.
