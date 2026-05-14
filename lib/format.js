/**
 * Terminal output formatting for GitHub Actions workflow runs
 */

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function truncate(str, maxLength) {
  if (!str) return "";
  const oneLine = str.replace(/\n/g, " ").trim();
  if (oneLine.length <= maxLength) return oneLine;
  return `${oneLine.slice(0, maxLength - 3)}...`;
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusIcon(status, conclusion) {
  if (conclusion === "success") return `${colors.green}✓${colors.reset}`;
  if (conclusion === "failure") return `${colors.red}✗${colors.reset}`;
  if (conclusion === "cancelled") return `${colors.dim}⊘${colors.reset}`;
  if (conclusion === "skipped") return `${colors.dim}−${colors.reset}`;
  if (status === "in_progress") return `${colors.yellow}●${colors.reset}`;
  if (status === "queued" || status === "waiting" || status === "pending")
    return `${colors.blue}◌${colors.reset}`;
  return `${colors.dim}?${colors.reset}`;
}

function conclusionColor(conclusion, status) {
  if (conclusion === "success") return colors.green;
  if (conclusion === "failure") return colors.red;
  if (status === "in_progress") return colors.yellow;
  if (status === "queued" || status === "waiting") return colors.blue;
  return colors.dim;
}

// ---------------------------------------------------------------------------
// Run formatting
// ---------------------------------------------------------------------------

function formatRunSummary(run) {
  const icon = statusIcon(run.status, run.conclusion);
  const color = conclusionColor(run.conclusion, run.status);
  const label = run.conclusion || run.status;
  const sha = run.sha || "";
  const time = timeAgo(run.createdAt);

  return `${colors.bright}[${run.id}]${colors.reset} ${icon} ${run.name} ${color}${label}${colors.reset}  ${colors.dim}${run.branch}  ${sha}  ${time}${colors.reset}`;
}

function formatRunDetail(run, jobs) {
  const lines = [];
  const icon = statusIcon(run.status, run.conclusion);
  const color = conclusionColor(run.conclusion, run.status);

  lines.push(`=== Workflow Run [${run.id}] ===`);
  lines.push(`${icon} ${run.name} ${color}${run.conclusion || run.status}${colors.reset}`);
  lines.push(
    `${colors.dim}Branch: ${run.branch}  SHA: ${run.sha}  Event: ${run.event}${colors.reset}`
  );
  lines.push(`${colors.dim}URL: ${run.url}${colors.reset}`);
  lines.push(`${colors.dim}Created: ${run.createdAt}${colors.reset}`);
  lines.push("");

  if (jobs.length === 0) {
    lines.push(`${colors.dim}No jobs found.${colors.reset}`);
    return lines.join("\n");
  }

  lines.push(`${colors.bright}Jobs (${jobs.length}):${colors.reset}`);

  for (const job of jobs) {
    const jobIcon = statusIcon(job.status, job.conclusion);
    const jobColor = conclusionColor(job.conclusion, job.status);
    lines.push(
      `  ${jobIcon} ${jobColor}${job.name}${colors.reset} ${colors.dim}(${job.conclusion || job.status})${colors.reset}`
    );

    for (const step of job.steps) {
      const stepIcon = statusIcon(step.status, step.conclusion);
      const isFailure = step.conclusion === "failure";
      const stepColor = isFailure ? colors.red : colors.dim;
      lines.push(`    ${stepIcon} ${stepColor}${step.name}${colors.reset}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Job/log formatting
// ---------------------------------------------------------------------------

function formatJobDetail(job, logExcerpt) {
  const lines = [];
  const icon = statusIcon(job.status, job.conclusion);
  const color = conclusionColor(job.conclusion, job.status);

  lines.push(`=== Job [${job.id}] ===`);
  lines.push(`${icon} ${color}${job.name}${colors.reset} (${job.conclusion || job.status})`);
  lines.push(`${colors.dim}URL: ${job.url}${colors.reset}`);
  if (job.runnerName) {
    lines.push(`${colors.dim}Runner: ${job.runnerName}${colors.reset}`);
  }
  lines.push("");

  lines.push(`${colors.bright}Steps:${colors.reset}`);
  for (const step of job.steps) {
    const stepIcon = statusIcon(step.status, step.conclusion);
    const isFailure = step.conclusion === "failure";
    const stepColor = isFailure ? colors.red : colors.dim;
    lines.push(`  ${stepIcon} ${stepColor}Step ${step.number}: ${step.name}${colors.reset}`);
  }

  if (logExcerpt && logExcerpt.errors && logExcerpt.errors.length > 0) {
    lines.push("");
    lines.push(`${colors.bright}--- Error Log Excerpt ---${colors.reset}`);
    for (const range of logExcerpt.errors) {
      for (const line of range) {
        const prefix = `${colors.dim}${String(line.lineNumber).padStart(5)}${colors.reset}`;
        if (line.isError) {
          lines.push(`${prefix} ${colors.red}${line.text}${colors.reset}`);
        } else {
          lines.push(`${prefix} ${line.text}`);
        }
      }
      lines.push(`${colors.dim}  ...${colors.reset}`);
    }
    if (logExcerpt.truncated) {
      lines.push(
        `${colors.yellow}(log truncated, ${logExcerpt.totalLines} total lines)${colors.reset}`
      );
    }
    lines.push(`${colors.bright}--- End Error Log ---${colors.reset}`);
  }

  return lines.join("\n");
}

function formatLogExcerpt(logResult, maxLines) {
  if (!logResult || !logResult.errors || logResult.errors.length === 0) {
    return `${colors.dim}No error patterns found in log.${colors.reset}`;
  }

  const lines = [];
  let lineCount = 0;

  for (const range of logResult.errors) {
    for (const line of range) {
      if (maxLines && lineCount >= maxLines) break;
      if (line.isError) {
        lines.push(`${colors.red}${line.text}${colors.reset}`);
      } else {
        lines.push(line.text);
      }
      lineCount++;
    }
    if (maxLines && lineCount >= maxLines) break;
    lines.push(`${colors.dim}...${colors.reset}`);
  }

  if (logResult.truncated) {
    lines.push(`${colors.yellow}(truncated, ${logResult.totalLines} total lines)${colors.reset}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Watch formatting
// ---------------------------------------------------------------------------

function formatTimestamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function formatWatchStatus(pollCount, summary) {
  const parts = [];
  if (summary.success > 0) parts.push(`${colors.green}${summary.success} passing${colors.reset}`);
  if (summary.failure > 0) parts.push(`${colors.red}${summary.failure} failing${colors.reset}`);
  if (summary.pending > 0)
    parts.push(`${colors.yellow}${summary.pending} in progress${colors.reset}`);
  if (summary.other > 0) parts.push(`${colors.dim}${summary.other} other${colors.reset}`);

  return `${colors.dim}[${formatTimestamp()}] Poll #${pollCount}: ${parts.join(", ")} (${summary.total} total)${colors.reset}`;
}

// ---------------------------------------------------------------------------
// Output router
// ---------------------------------------------------------------------------

function formatOutput(data, options) {
  if (options.json) {
    return JSON.stringify(data, null, 2);
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      const statusFilter = options.status ? ` with status '${options.status}'` : "";
      return `${colors.green}No workflow runs found${statusFilter}.${colors.reset}`;
    }

    const header = `${colors.bright}Found ${data.length} workflow run${data.length === 1 ? "" : "s"}${colors.reset}\n`;
    const formatted = data.map((r) => formatRunSummary(r)).join("\n");
    return `${header}\n${formatted}`;
  }

  return String(data);
}

module.exports = {
  colors,
  truncate,
  timeAgo,
  statusIcon,
  formatRunSummary,
  formatRunDetail,
  formatJobDetail,
  formatLogExcerpt,
  formatTimestamp,
  formatWatchStatus,
  formatOutput,
};
