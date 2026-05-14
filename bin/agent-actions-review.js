#!/usr/bin/env node

/**
 * agent-actions-review -- CLI for diagnosing and fixing GitHub Actions failures
 *
 * Inspired by pbakaus/agent-reviews (https://github.com/pbakaus/agent-reviews).
 * While agent-reviews handles PR review comments, this tool focuses on CI/CD
 * workflow runs: listing failures, analyzing logs, triggering re-runs, and
 * watching until all checks pass green.
 *
 * Usage:
 *   agent-actions-review                          # List runs for current branch
 *   agent-actions-review list --status failure     # List failing runs
 *   agent-actions-review detail <run_id>           # Show failing steps + log errors
 *   agent-actions-review logs <job_id>             # Show job log errors
 *   agent-actions-review rerun <run_id>            # Re-run failed jobs
 *   agent-actions-review watch                     # Poll until all green
 *   agent-actions-review --json                    # Output as JSON for scripting
 */

const { getProxyFetch, getGitHubToken, getRepoInfo, getCurrentBranch } = require("../lib/github");

const {
  listWorkflowRuns,
  getWorkflowRun,
  listJobsForRun,
  getJobLogs,
  rerunFailedJobs,
  rerunWorkflow,
  findFailingSteps,
  extractLogErrors,
  categorizeFailure,
  areAllChecksPassing,
} = require("../lib/actions");

const {
  colors,
  formatRunDetail,
  formatLogExcerpt,
  formatTimestamp,
  formatWatchStatus,
  formatOutput,
} = require("../lib/format");

const proxyFetch = getProxyFetch();

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    command: "list",
    runId: null,
    jobId: null,
    status: null,
    branch: null,
    prNumber: null,
    json: false,
    rerunAll: false,
    watchInterval: 30,
    watchTimeout: 600,
    help: false,
    version: false,
    failuresOnly: false,
    logsOnly: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "list":
        result.command = "list";
        break;
      case "detail":
        result.command = "detail";
        if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
          result.runId = args[++i];
        }
        break;
      case "logs":
        result.command = "logs";
        if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
          result.jobId = args[++i];
        }
        break;
      case "rerun":
        result.command = "rerun";
        if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
          result.runId = args[++i];
        }
        break;
      case "watch":
        result.command = "watch";
        break;
      case "--status":
      case "-s":
        result.status = args[++i];
        break;
      case "--branch":
      case "-b":
        result.branch = args[++i];
        break;
      case "--pr":
      case "-p":
        result.prNumber = Number.parseInt(args[++i], 10);
        break;
      case "--json":
      case "-j":
        result.json = true;
        break;
      case "--failures-only":
        result.failuresOnly = true;
        break;
      case "--logs-only":
        result.logsOnly = true;
        break;
      case "--all":
        result.rerunAll = true;
        break;
      case "--interval":
      case "-i":
        result.watchInterval = Number.parseInt(args[++i], 10);
        break;
      case "--timeout":
        result.watchTimeout = Number.parseInt(args[++i], 10);
        break;
      case "--help":
      case "-h":
        result.help = true;
        break;
      case "--version":
      case "-v":
        result.version = true;
        break;
      default:
        break;
    }
  }

  return result;
}

function showHelp() {
  console.log(`
${colors.bright}agent-actions-review${colors.reset} -- Diagnose and fix GitHub Actions CI/CD failures

Inspired by pbakaus/agent-reviews (https://github.com/pbakaus/agent-reviews).
Designed for both human use and as a tool for AI coding agents.

${colors.bright}Commands:${colors.reset}
  list                             List workflow runs for current branch (default)
  detail <run_id>                  Show failing jobs, steps, and log error excerpts
  logs <job_id>                    Fetch and display job log errors
  rerun <run_id>                   Re-run failed jobs in a workflow run
  watch                            Poll until all checks pass green

${colors.bright}Options:${colors.reset}
  -s, --status <status>   Filter runs by status (failure, in_progress, success, completed)
  -b, --branch <name>     Target a specific branch (auto-detects from git)
  -p, --pr <number>       Find branch from PR number
  -j, --json              Output as JSON for scripting/agent consumption
      --failures-only     With detail+json: output { run, failures } only (no jobs)
      --logs-only         With detail+json: output flat [{ job, step, errors, tail }] array
      --all               Re-run entire workflow (with rerun command)
  -h, --help              Show this help
  -v, --version           Show version

${colors.bright}Watch Options:${colors.reset}
  -i, --interval <N>      Poll interval in seconds (default: 30)
      --timeout <N>       Exit after N seconds with no state change (default: 600)

${colors.bright}Examples:${colors.reset}
  agent-actions-review                              # Show all runs for current branch
  agent-actions-review list --status failure         # Show failing runs
  agent-actions-review detail 12345678              # Show run details + log errors
  agent-actions-review logs 87654321                # Show job log errors
  agent-actions-review rerun 12345678               # Re-run failed jobs
  agent-actions-review rerun 12345678 --all         # Re-run entire workflow
  agent-actions-review watch                        # Poll until green
  agent-actions-review watch -i 15 --timeout 300    # Custom poll interval
  agent-actions-review list --json | jq '.[]'       # Pipe to jq

${colors.bright}Authentication:${colors.reset}
  Set GITHUB_TOKEN env var, or use 'gh auth login' (gh CLI).
`);
}

// ---------------------------------------------------------------------------
// Watch mode
// ---------------------------------------------------------------------------

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function watchCommand(owner, repo, branch, token, options) {
  let lastState = null;
  let lastChangeTime = Date.now();
  let pollCount = 0;

  if (!options.json) {
    console.log(`\n${colors.bright}=== Actions Watch Mode ===${colors.reset}`);
    console.log(`${colors.dim}Branch: ${branch}${colors.reset}`);
    console.log(
      `${colors.dim}Polling every ${options.watchInterval}s, exit after ${options.watchTimeout}s of inactivity${colors.reset}`
    );
    console.log(`${colors.dim}Started at ${formatTimestamp()}${colors.reset}\n`);
  }

  // Initial check
  const initial = await areAllChecksPassing(owner, repo, branch, token, proxyFetch);

  if (!options.json) {
    console.log(formatWatchStatus(0, initial.summary));
  }

  if (initial.allPassing) {
    if (options.json) {
      console.log(
        JSON.stringify({ allPassing: true, summary: initial.summary, runs: initial.runs }, null, 2)
      );
    } else {
      console.log(`\n${colors.green}=== ALL CHECKS PASSING ===${colors.reset}`);
      console.log(`${colors.dim}All ${initial.summary.total} workflow runs passed.${colors.reset}`);
    }
    return;
  }

  lastState = JSON.stringify(initial.summary);

  // Poll loop
  while (true) {
    await sleep(options.watchInterval);
    pollCount++;

    const result = await areAllChecksPassing(owner, repo, branch, token, proxyFetch);

    if (!options.json) {
      console.log(formatWatchStatus(pollCount, result.summary));
    }

    if (result.allPassing) {
      if (options.json) {
        console.log(
          JSON.stringify({ allPassing: true, summary: result.summary, runs: result.runs }, null, 2)
        );
      } else {
        console.log(`\n${colors.green}=== ALL CHECKS PASSING ===${colors.reset}`);
        console.log(
          `${colors.dim}All ${result.summary.total} workflow runs passed. Exiting.${colors.reset}`
        );
      }
      return;
    }

    // Check for state changes
    const currentState = JSON.stringify(result.summary);
    if (currentState !== lastState) {
      lastState = currentState;
      lastChangeTime = Date.now();
    }

    // Check timeout
    const inactiveSeconds = Math.round((Date.now() - lastChangeTime) / 1000);
    if (inactiveSeconds >= options.watchTimeout) {
      if (options.json) {
        console.log(
          JSON.stringify(
            { allPassing: false, timedOut: true, summary: result.summary, runs: result.runs },
            null,
            2
          )
        );
      } else {
        console.log(`\n${colors.yellow}=== WATCH TIMED OUT ===${colors.reset}`);
        console.log(`${colors.dim}No state change after ${options.watchTimeout}s.${colors.reset}`);
        console.log(
          `${colors.dim}Final state: ${result.summary.success}/${result.summary.total} passing${colors.reset}`
        );
      }
      process.exitCode = 1;
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs();

  if (options.version) {
    const pkg = require("../package.json");
    console.log(pkg.version);
    process.exit(0);
  }

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Auth
  const token = getGitHubToken();
  if (!token) {
    console.error(`${colors.red}Error: GitHub token not found${colors.reset}`);
    console.error("Set GITHUB_TOKEN env var, or authenticate with: gh auth login");
    process.exit(1);
  }

  // Repo
  const repoInfo = getRepoInfo();
  if (!repoInfo) {
    console.error(
      `${colors.red}Error: Could not determine repository from git remote${colors.reset}`
    );
    process.exit(1);
  }
  const { owner, repo } = repoInfo;

  // Branch
  let branch = options.branch;
  if (!branch) {
    if (options.prNumber) {
      // Fetch PR to get the branch name
      const res = await proxyFetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${options.prNumber}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "agent-actions-review",
          },
        }
      );
      if (!res.ok) {
        console.error(`${colors.red}Error: Could not fetch PR #${options.prNumber}${colors.reset}`);
        process.exit(1);
      }
      const pr = await res.json();
      branch = pr.head.ref;
    } else {
      branch = getCurrentBranch();
    }
  }

  if (!branch) {
    console.error(`${colors.red}Error: Could not determine branch${colors.reset}`);
    process.exit(1);
  }

  // Command routing
  switch (options.command) {
    case "list": {
      const runs = await listWorkflowRuns(owner, repo, branch, token, proxyFetch, {
        status: options.status,
      });
      console.log(formatOutput(runs, options));
      break;
    }

    case "detail": {
      if (!options.runId) {
        console.error(`${colors.red}Error: detail command requires a run ID${colors.reset}`);
        console.error("Usage: agent-actions-review detail <run_id>");
        process.exit(1);
      }

      const run = await getWorkflowRun(owner, repo, options.runId, token, proxyFetch);
      const jobs = await listJobsForRun(owner, repo, options.runId, token, proxyFetch);
      const failures = findFailingSteps(jobs);

      // Fetch logs for failing jobs and analyze them
      const jobLogMap = new Map();
      const jobCategoryMap = new Map();

      for (const { job, step } of failures) {
        if (!jobLogMap.has(job.id)) {
          try {
            const logText = await getJobLogs(owner, repo, job.id, token, proxyFetch);
            const logResult = extractLogErrors(logText);
            jobLogMap.set(job.id, logResult);

            // Build excerpt text from error lines for categorization
            const excerptText = logResult.errors
              .flat()
              .filter((l) => l.isError)
              .map((l) => l.text)
              .join("\n");
            jobCategoryMap.set(job.id, categorizeFailure(job, step, excerptText));
          } catch {
            jobLogMap.set(job.id, null);
            jobCategoryMap.set(job.id, {
              category: "UNKNOWN",
              confidence: "low",
              reason: "Could not fetch logs",
            });
          }
        }
      }

      if (options.json) {
        let output;
        if (options.logsOnly) {
          output = failures.map(({ job, step }) => {
            const logResult = jobLogMap.get(job.id);
            return {
              job: job.name,
              step: step.name,
              errors: logResult ? logResult.errors : [],
              tail: logResult ? logResult.tail : [],
            };
          });
        } else {
          const failureEntries = failures.map(({ job, step }) => ({
            job: { id: job.id, name: job.name },
            step: { number: step.number, name: step.name },
            category: jobCategoryMap.get(job.id) || null,
            logErrors: jobLogMap.get(job.id) || null,
          }));
          output = options.failuresOnly
            ? { run, failures: failureEntries }
            : { run, jobs, failures: failureEntries };
        }
        console.log(JSON.stringify(output, null, 2));
      } else {
        console.log(formatRunDetail(run, jobs));

        if (failures.length > 0) {
          console.log(`\n${colors.bright}Failure Analysis:${colors.reset}`);
          for (const { job, step } of failures) {
            const category = jobCategoryMap.get(job.id);
            const logResult = jobLogMap.get(job.id);
            const catColor =
              category.category === "FIXABLE"
                ? colors.cyan
                : category.category === "FLAKY"
                  ? colors.yellow
                  : category.category === "INFRA"
                    ? colors.magenta
                    : colors.dim;

            console.log(`\n  ${colors.red}${job.name} > ${step.name}${colors.reset}`);
            console.log(
              `  ${catColor}[${category.category}]${colors.reset} ${category.reason} (${category.confidence} confidence)`
            );

            if (logResult) {
              console.log(`  ${colors.dim}Log errors:${colors.reset}`);
              console.log(formatLogExcerpt(logResult, 20));
            }
          }
        }
      }
      break;
    }

    case "logs": {
      if (!options.jobId) {
        console.error(`${colors.red}Error: logs command requires a job ID${colors.reset}`);
        console.error("Usage: agent-actions-review logs <job_id>");
        process.exit(1);
      }

      const logText = await getJobLogs(owner, repo, options.jobId, token, proxyFetch);
      const logResult = extractLogErrors(logText);

      if (options.json) {
        console.log(JSON.stringify(logResult, null, 2));
      } else {
        console.log(formatLogExcerpt(logResult, 50));
      }
      break;
    }

    case "rerun": {
      if (!options.runId) {
        console.error(`${colors.red}Error: rerun command requires a run ID${colors.reset}`);
        console.error("Usage: agent-actions-review rerun <run_id>");
        process.exit(1);
      }

      let result;
      if (options.rerunAll) {
        result = await rerunWorkflow(owner, repo, options.runId, token, proxyFetch);
      } else {
        result = await rerunFailedJobs(owner, repo, options.runId, token, proxyFetch);
      }

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const type = options.rerunAll ? "entire workflow" : "failed jobs";
        console.log(
          `${colors.green}Re-run triggered for ${type} in run ${options.runId}${colors.reset}`
        );
      }
      break;
    }

    case "watch": {
      await watchCommand(owner, repo, branch, token, options);
      break;
    }
  }
}

main().catch((error) => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});
