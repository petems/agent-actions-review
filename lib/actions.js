/**
 * GitHub Actions API module for agent-actions-review
 *
 * Handles workflow runs, jobs, logs, re-runs, and failure analysis.
 */

const API_BASE = "https://api.github.com";
const USER_AGENT = "agent-actions-review";

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function apiHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function apiGet(url, token, proxyFetch) {
  const res = await proxyFetch(url, { headers: apiHeaders(token) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }
  return res.json();
}

async function apiPost(url, token, proxyFetch, body = undefined) {
  const options = {
    method: "POST",
    headers: apiHeaders(token),
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
    options.headers["Content-Type"] = "application/json";
  }
  const res = await proxyFetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Workflow runs
// ---------------------------------------------------------------------------

async function listWorkflowRuns(owner, repo, branch, token, proxyFetch, options = {}) {
  const params = new URLSearchParams({ branch, per_page: "20" });
  if (options.status) {
    params.set("status", options.status);
  }
  if (options.event) {
    params.set("event", options.event);
  }
  const url = `${API_BASE}/repos/${owner}/${repo}/actions/runs?${params}`;
  const data = await apiGet(url, token, proxyFetch);
  return (data.workflow_runs || []).map(processRun);
}

async function getWorkflowRun(owner, repo, runId, token, proxyFetch) {
  const url = `${API_BASE}/repos/${owner}/${repo}/actions/runs/${runId}`;
  const data = await apiGet(url, token, proxyFetch);
  return processRun(data);
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

async function listJobsForRun(owner, repo, runId, token, proxyFetch, filter = "latest") {
  const url = `${API_BASE}/repos/${owner}/${repo}/actions/runs/${runId}/jobs?filter=${filter}`;
  const data = await apiGet(url, token, proxyFetch);
  return (data.jobs || []).map(processJob);
}

async function getJobLogs(owner, repo, jobId, token, proxyFetch) {
  const url = `${API_BASE}/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`;
  const res = await proxyFetch(url, {
    headers: apiHeaders(token),
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch logs: ${res.status}`);
  }
  return res.text();
}

// ---------------------------------------------------------------------------
// Re-runs
// ---------------------------------------------------------------------------

async function rerunFailedJobs(owner, repo, runId, token, proxyFetch) {
  const url = `${API_BASE}/repos/${owner}/${repo}/actions/runs/${runId}/rerun-failed-jobs`;
  await apiPost(url, token, proxyFetch);
  return { success: true, runId, type: "rerun-failed" };
}

async function rerunWorkflow(owner, repo, runId, token, proxyFetch) {
  const url = `${API_BASE}/repos/${owner}/${repo}/actions/runs/${runId}/rerun`;
  await apiPost(url, token, proxyFetch);
  return { success: true, runId, type: "rerun-all" };
}

// ---------------------------------------------------------------------------
// Data processing (pure functions)
// ---------------------------------------------------------------------------

function processRun(run) {
  return {
    id: run.id,
    name: run.name || run.display_title || "Unknown",
    status: run.status,
    conclusion: run.conclusion,
    branch: run.head_branch,
    sha: run.head_sha ? run.head_sha.slice(0, 7) : null,
    url: run.html_url,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    event: run.event,
    workflowId: run.workflow_id,
    runNumber: run.run_number,
    runAttempt: run.run_attempt,
  };
}

function processJob(job) {
  return {
    id: job.id,
    runId: job.run_id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    url: job.html_url,
    runnerName: job.runner_name,
    steps: (job.steps || []).map(processStep),
  };
}

function processStep(step) {
  return {
    number: step.number,
    name: step.name,
    status: step.status,
    conclusion: step.conclusion,
    startedAt: step.started_at,
    completedAt: step.completed_at,
  };
}

function findFailingSteps(jobs) {
  const failures = [];
  for (const job of jobs) {
    if (job.conclusion !== "failure") continue;
    for (const step of job.steps) {
      if (step.conclusion === "failure") {
        failures.push({ job, step });
      }
    }
  }
  return failures;
}

// ---------------------------------------------------------------------------
// Log analysis
// ---------------------------------------------------------------------------

const ERROR_PATTERNS = [
  /\berror\b/i,
  /\bError:/,
  /\bERROR\b/,
  /\bFAIL(ED|URE|ING)?\b/,
  /\bfatal\b/i,
  /\bpanic\b/i,
  /exit code [1-9]/i,
  /exited with code [1-9]/i,
  /\bsyntax error\b/i,
  /\bTypeError\b/,
  /\bReferenceError\b/,
  /\bSyntaxError\b/,
  /\bAssertionError\b/,
  /\bModuleNotFoundError\b/,
  /\bnot found\b/i,
  /\bcommand not found\b/,
  /\bpermission denied\b/i,
  /\bsegmentation fault\b/i,
  /\bout of memory\b/i,
  /\bno space left\b/i,
  /\btimed? ?out\b/i,
  /\bProcess completed with exit code [1-9]/,
];

function extractLogErrors(logText, options = {}) {
  const maxLines = options.maxLines || 200;
  const contextLines = options.contextLines || 3;

  if (!logText || logText.trim().length === 0) {
    return { errors: [], tail: [], truncated: false, totalLines: 0 };
  }

  const lines = logText.split("\n");
  const totalLines = lines.length;
  const errorLineNumbers = new Set();

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test(lines[i])) {
        errorLineNumbers.add(i);
        break;
      }
    }
  }

  // Build context windows around each error line
  const includedLines = new Set();
  for (const lineNum of errorLineNumbers) {
    for (
      let i = Math.max(0, lineNum - contextLines);
      i <= Math.min(lines.length - 1, lineNum + contextLines);
      i++
    ) {
      includedLines.add(i);
    }
  }

  // Always include the last 20 lines (often contains summary/exit status)
  const tailStart = Math.max(0, lines.length - 20);
  for (let i = tailStart; i < lines.length; i++) {
    includedLines.add(i);
  }

  // Build error excerpts as contiguous ranges
  const sortedLines = [...includedLines].sort((a, b) => a - b);
  const errors = [];
  let currentRange = [];

  for (let i = 0; i < sortedLines.length; i++) {
    const lineNum = sortedLines[i];
    if (currentRange.length === 0 || lineNum === sortedLines[i - 1] + 1) {
      currentRange.push({ lineNumber: lineNum + 1, text: lines[lineNum], isError: errorLineNumbers.has(lineNum) });
    } else {
      errors.push(currentRange);
      currentRange = [{ lineNumber: lineNum + 1, text: lines[lineNum], isError: errorLineNumbers.has(lineNum) }];
    }
  }
  if (currentRange.length > 0) {
    errors.push(currentRange);
  }

  // Tail is the last 20 lines
  const tail = lines.slice(tailStart).map((text, i) => ({
    lineNumber: tailStart + i + 1,
    text,
  }));

  // Check if we'd exceed maxLines
  let totalOutputLines = 0;
  for (const range of errors) {
    totalOutputLines += range.length;
  }
  const truncated = totalOutputLines > maxLines;

  // Truncate if needed by keeping most relevant ranges
  if (truncated) {
    let kept = 0;
    const truncatedErrors = [];
    for (const range of errors) {
      if (kept + range.length <= maxLines) {
        truncatedErrors.push(range);
        kept += range.length;
      } else {
        const remaining = maxLines - kept;
        if (remaining > 0) {
          truncatedErrors.push(range.slice(0, remaining));
        }
        break;
      }
    }
    return { errors: truncatedErrors, tail, truncated: true, totalLines };
  }

  return { errors, tail, truncated: false, totalLines };
}

// ---------------------------------------------------------------------------
// Failure categorization
// ---------------------------------------------------------------------------

const FLAKY_PATTERNS = [
  /\btimeout\b/i,
  /\btimed? ?out\b/i,
  /\bECONNRESET\b/,
  /\bECONNREFUSED\b/,
  /\bsocket hang up\b/i,
  /\bnetwork error\b/i,
  /\bDNS resolution\b/i,
  /\bretry\b/i,
  /\bflaky\b/i,
  /\bintermittent\b/i,
  /\brate limit\b/i,
  /\b429\b/,
  /\b503\b/,
  /\bservice unavailable\b/i,
];

const INFRA_PATTERNS = [
  /\bno space left on device\b/i,
  /\bout of memory\b/i,
  /\bOOM\b/,
  /\bkilled\b/i,
  /\brunner\b.*\b(error|fail)/i,
  /\bGitHub Actions\b.*\b(error|fail|unavailable)/i,
  /\bsegmentation fault\b/i,
  /\binfrastructure\b/i,
  /\bprovisioning\b.*\bfail/i,
  /\bImage not found\b/i,
];

const FIXABLE_TEST_PATTERNS = [
  /\bAssertionError\b/,
  /\bexpect\b.*\b(toBe|toEqual|toMatch|toContain|toThrow)\b/,
  /\bFAIL\b.*\.test\./,
  /\bfailing tests?\b/i,
  /\btest suite failed\b/i,
  /\bpytest\b.*\bFAILED\b/,
  /\bRSpec\b.*\bfailure/i,
];

const FIXABLE_LINT_PATTERNS = [
  /\beslint\b/i,
  /\bprettier\b/i,
  /\blinting error\b/i,
  /\bstyle violation\b/i,
  /\brubocop\b/i,
  /\bflake8\b/i,
  /\bmypy\b/i,
];

const FIXABLE_BUILD_PATTERNS = [
  /\bTS\d{4}\b/,
  /\btsc\b.*\berror\b/i,
  /\bcompilation error\b/i,
  /\bsyntax error\b/i,
  /\bSyntaxError\b/,
  /\bTypeError\b/,
  /\bReferenceError\b/,
  /\bModuleNotFoundError\b/,
  /\bimport\b.*\bnot found\b/i,
  /\bcannot find module\b/i,
  /\bundefined variable\b/i,
];

const FIXABLE_DEPENDENCY_PATTERNS = [
  /\bnpm ERR!\b/,
  /\bERR_PNPM\b/,
  /\byarn error\b/i,
  /\blockfile\b.*\bout of date\b/i,
  /\bpeer dep\b/i,
  /\bmissing dependency\b/i,
  /\bpackage.*not found\b/i,
];

function categorizeFailure(job, step, logExcerpt) {
  const text = logExcerpt || "";
  const stepName = (step && step.name) || "";
  const combined = `${stepName}\n${text}`;

  // Check infra first (highest priority, not fixable from code)
  for (const pattern of INFRA_PATTERNS) {
    if (pattern.test(combined)) {
      return { category: "INFRA", confidence: "high", reason: `Infrastructure issue: ${pattern.source}` };
    }
  }

  // Check flaky patterns
  for (const pattern of FLAKY_PATTERNS) {
    if (pattern.test(combined)) {
      return { category: "FLAKY", confidence: "medium", reason: `Likely flaky: ${pattern.source}` };
    }
  }

  // Check fixable patterns (most specific first)
  for (const pattern of FIXABLE_TEST_PATTERNS) {
    if (pattern.test(combined)) {
      return { category: "FIXABLE", confidence: "high", reason: "Test failure", subcategory: "test" };
    }
  }

  for (const pattern of FIXABLE_LINT_PATTERNS) {
    if (pattern.test(combined)) {
      return { category: "FIXABLE", confidence: "high", reason: "Lint/style error", subcategory: "lint" };
    }
  }

  for (const pattern of FIXABLE_BUILD_PATTERNS) {
    if (pattern.test(combined)) {
      return { category: "FIXABLE", confidence: "high", reason: "Build/compilation error", subcategory: "build" };
    }
  }

  for (const pattern of FIXABLE_DEPENDENCY_PATTERNS) {
    if (pattern.test(combined)) {
      return { category: "FIXABLE", confidence: "medium", reason: "Dependency issue", subcategory: "dependency" };
    }
  }

  return { category: "UNKNOWN", confidence: "low", reason: "Could not determine failure type" };
}

// ---------------------------------------------------------------------------
// Watch helpers
// ---------------------------------------------------------------------------

async function areAllChecksPassing(owner, repo, branch, token, proxyFetch) {
  const runs = await listWorkflowRuns(owner, repo, branch, token, proxyFetch);

  if (runs.length === 0) {
    return { allPassing: false, summary: { total: 0, success: 0, failure: 0, pending: 0, other: 0 }, runs };
  }

  // Group by workflow, take the latest run per workflow
  const latestByWorkflow = new Map();
  for (const run of runs) {
    const key = run.workflowId;
    if (!latestByWorkflow.has(key) || new Date(run.createdAt) > new Date(latestByWorkflow.get(key).createdAt)) {
      latestByWorkflow.set(key, run);
    }
  }

  const latestRuns = [...latestByWorkflow.values()];
  let success = 0;
  let failure = 0;
  let pending = 0;
  let other = 0;

  for (const run of latestRuns) {
    if (run.conclusion === "success") {
      success++;
    } else if (run.conclusion === "failure") {
      failure++;
    } else if (run.status === "in_progress" || run.status === "queued" || run.status === "waiting" || run.status === "pending") {
      pending++;
    } else {
      other++;
    }
  }

  const total = latestRuns.length;
  const allPassing = success === total && total > 0;

  return { allPassing, summary: { total, success, failure, pending, other }, runs: latestRuns };
}

module.exports = {
  listWorkflowRuns,
  getWorkflowRun,
  listJobsForRun,
  getJobLogs,
  rerunFailedJobs,
  rerunWorkflow,
  processRun,
  processJob,
  processStep,
  findFailingSteps,
  extractLogErrors,
  categorizeFailure,
  areAllChecksPassing,
};
