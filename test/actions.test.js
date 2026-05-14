import { describe, it, expect } from "vitest";
import {
  processRun,
  processJob,
  processStep,
  findFailingSteps,
  extractLogErrors,
  categorizeFailure,
} from "../lib/actions.js";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockRawRun = {
  id: 12345678,
  name: "CI",
  display_title: "CI",
  status: "completed",
  conclusion: "failure",
  head_branch: "feature-branch",
  head_sha: "abc1234567890def",
  html_url: "https://github.com/owner/repo/actions/runs/12345678",
  created_at: "2026-04-12T10:00:00Z",
  updated_at: "2026-04-12T10:05:00Z",
  event: "push",
  workflow_id: 100,
  run_number: 42,
  run_attempt: 1,
};

const mockRawJob = {
  id: 87654321,
  run_id: 12345678,
  name: "build-and-test",
  status: "completed",
  conclusion: "failure",
  started_at: "2026-04-12T10:00:30Z",
  completed_at: "2026-04-12T10:04:00Z",
  html_url: "https://github.com/owner/repo/actions/runs/12345678/job/87654321",
  runner_name: "ubuntu-latest",
  steps: [
    {
      number: 1,
      name: "Checkout",
      status: "completed",
      conclusion: "success",
      started_at: "2026-04-12T10:00:31Z",
      completed_at: "2026-04-12T10:00:35Z",
    },
    {
      number: 2,
      name: "Install dependencies",
      status: "completed",
      conclusion: "success",
      started_at: "2026-04-12T10:00:36Z",
      completed_at: "2026-04-12T10:02:00Z",
    },
    {
      number: 3,
      name: "Run tests",
      status: "completed",
      conclusion: "failure",
      started_at: "2026-04-12T10:02:01Z",
      completed_at: "2026-04-12T10:04:00Z",
    },
  ],
};

// ---------------------------------------------------------------------------
// processRun
// ---------------------------------------------------------------------------

describe("processRun", () => {
  it("transforms raw run data", () => {
    const result = processRun(mockRawRun);
    expect(result.id).toBe(12345678);
    expect(result.name).toBe("CI");
    expect(result.status).toBe("completed");
    expect(result.conclusion).toBe("failure");
    expect(result.branch).toBe("feature-branch");
    expect(result.sha).toBe("abc1234");
    expect(result.url).toBe("https://github.com/owner/repo/actions/runs/12345678");
    expect(result.event).toBe("push");
    expect(result.workflowId).toBe(100);
    expect(result.runNumber).toBe(42);
  });

  it("handles missing sha", () => {
    const run = { ...mockRawRun, head_sha: null };
    const result = processRun(run);
    expect(result.sha).toBe(null);
  });

  it("uses display_title as fallback name", () => {
    const run = { ...mockRawRun, name: null, display_title: "My Workflow" };
    const result = processRun(run);
    expect(result.name).toBe("My Workflow");
  });
});

// ---------------------------------------------------------------------------
// processJob
// ---------------------------------------------------------------------------

describe("processJob", () => {
  it("transforms raw job data with steps", () => {
    const result = processJob(mockRawJob);
    expect(result.id).toBe(87654321);
    expect(result.name).toBe("build-and-test");
    expect(result.conclusion).toBe("failure");
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].name).toBe("Checkout");
    expect(result.steps[2].conclusion).toBe("failure");
  });

  it("handles job with no steps", () => {
    const job = { ...mockRawJob, steps: undefined };
    const result = processJob(job);
    expect(result.steps).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// processStep
// ---------------------------------------------------------------------------

describe("processStep", () => {
  it("transforms step data", () => {
    const result = processStep(mockRawJob.steps[0]);
    expect(result.number).toBe(1);
    expect(result.name).toBe("Checkout");
    expect(result.status).toBe("completed");
    expect(result.conclusion).toBe("success");
  });
});

// ---------------------------------------------------------------------------
// findFailingSteps
// ---------------------------------------------------------------------------

describe("findFailingSteps", () => {
  it("finds failing steps in failing jobs", () => {
    const jobs = [processJob(mockRawJob)];
    const failures = findFailingSteps(jobs);
    expect(failures).toHaveLength(1);
    expect(failures[0].job.name).toBe("build-and-test");
    expect(failures[0].step.name).toBe("Run tests");
  });

  it("returns empty array for all-passing jobs", () => {
    const passingJob = {
      ...mockRawJob,
      conclusion: "success",
      steps: mockRawJob.steps.map((s) => ({ ...s, conclusion: "success" })),
    };
    const jobs = [processJob(passingJob)];
    const failures = findFailingSteps(jobs);
    expect(failures).toEqual([]);
  });

  it("handles multiple failures across jobs", () => {
    const job1 = processJob(mockRawJob);
    const job2 = processJob({
      ...mockRawJob,
      id: 99999,
      name: "lint",
      steps: [
        { number: 1, name: "Checkout", status: "completed", conclusion: "success" },
        { number: 2, name: "Lint", status: "completed", conclusion: "failure" },
      ],
    });
    const failures = findFailingSteps([job1, job2]);
    expect(failures).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// extractLogErrors
// ---------------------------------------------------------------------------

describe("extractLogErrors", () => {
  it("extracts lines matching error patterns", () => {
    const log = [
      "Step 1: Checkout",
      "Cloning repository...",
      "Step 2: Run tests",
      "Running test suite...",
      "FAIL src/utils.test.js",
      "  Expected: 42",
      "  Received: undefined",
      "Tests: 1 failed, 10 passed",
      "Process completed with exit code 1",
    ].join("\n");

    const result = extractLogErrors(log);
    expect(result.errors.length).toBeGreaterThan(0);
    const allErrorLines = result.errors.flat().filter((l) => l.isError);
    expect(allErrorLines.some((l) => l.text.includes("FAIL"))).toBe(true);
  });

  it("returns empty for logs with no errors", () => {
    const log = [
      "Step 1: Checkout",
      "Cloning repository...",
      "Step 2: Run tests",
      "All tests passed.",
      "Done.",
    ].join("\n");

    const result = extractLogErrors(log);
    // Should still have tail lines but no error-flagged lines in errors
    const errorLines = result.errors.flat().filter((l) => l.isError);
    expect(errorLines).toHaveLength(0);
  });

  it("handles empty log text", () => {
    const result = extractLogErrors("");
    expect(result.errors).toEqual([]);
    expect(result.totalLines).toBe(0);
  });

  it("handles null log text", () => {
    const result = extractLogErrors(null);
    expect(result.errors).toEqual([]);
  });

  it("respects maxLines option", () => {
    const lines = [];
    for (let i = 0; i < 500; i++) {
      lines.push(`Error on line ${i}`);
    }
    const result = extractLogErrors(lines.join("\n"), { maxLines: 50 });
    const totalOutputLines = result.errors.reduce((sum, r) => sum + r.length, 0);
    expect(totalOutputLines).toBeLessThanOrEqual(50);
    expect(result.truncated).toBe(true);
  });

  it("includes context lines around errors", () => {
    const lines = [
      "line 0: setup",
      "line 1: config",
      "line 2: start",
      "line 3: Error: something broke",
      "line 4: cleanup",
      "line 5: done",
      "line 6: end",
    ].join("\n");

    const result = extractLogErrors(lines, { contextLines: 2 });
    const allLines = result.errors.flat();
    // Should include context around the error line
    expect(allLines.some((l) => l.text.includes("Error: something broke"))).toBe(true);
    expect(allLines.some((l) => l.text.includes("line 2: start"))).toBe(true);
    expect(allLines.some((l) => l.text.includes("line 4: cleanup"))).toBe(true);
  });

  it("always includes tail lines", () => {
    const lines = [];
    for (let i = 0; i < 100; i++) {
      lines.push(`line ${i}: normal output`);
    }
    const result = extractLogErrors(lines.join("\n"));
    expect(result.tail.length).toBe(20);
    expect(result.tail[0].lineNumber).toBe(81);
  });
});

// ---------------------------------------------------------------------------
// categorizeFailure
// ---------------------------------------------------------------------------

describe("categorizeFailure", () => {
  const mockJob = { id: 1, name: "test-job" };
  const mockStep = { number: 1, name: "Run tests" };

  it("categorizes test failures as FIXABLE", () => {
    const result = categorizeFailure(
      mockJob,
      mockStep,
      "FAIL src/utils.test.js\n  AssertionError: expected 42 to equal undefined"
    );
    expect(result.category).toBe("FIXABLE");
    expect(result.subcategory).toBe("test");
  });

  it("categorizes lint errors as FIXABLE", () => {
    const result = categorizeFailure(
      mockJob,
      { number: 1, name: "Lint" },
      "eslint found 3 errors\n  src/index.js: Missing semicolon"
    );
    expect(result.category).toBe("FIXABLE");
    expect(result.subcategory).toBe("lint");
  });

  it("categorizes TypeScript errors as FIXABLE", () => {
    const result = categorizeFailure(
      mockJob,
      { number: 1, name: "Build" },
      "src/app.ts(42,10): error TS2304: Cannot find name 'foo'"
    );
    expect(result.category).toBe("FIXABLE");
    expect(result.subcategory).toBe("build");
  });

  it("categorizes dependency errors as FIXABLE", () => {
    const result = categorizeFailure(
      mockJob,
      { number: 1, name: "Install" },
      "npm ERR! peer dep missing: react@^18.0.0"
    );
    expect(result.category).toBe("FIXABLE");
    expect(result.subcategory).toBe("dependency");
  });

  it("categorizes timeouts as FLAKY", () => {
    const result = categorizeFailure(
      mockJob,
      mockStep,
      "Error: Timeout - Async callback was not invoked within 5000ms"
    );
    expect(result.category).toBe("FLAKY");
  });

  it("categorizes network errors as FLAKY", () => {
    const result = categorizeFailure(
      mockJob,
      mockStep,
      "Error: ECONNRESET - Connection reset by peer"
    );
    expect(result.category).toBe("FLAKY");
  });

  it("categorizes OOM as INFRA", () => {
    const result = categorizeFailure(
      mockJob,
      mockStep,
      "FATAL ERROR: JavaScript heap out of memory"
    );
    expect(result.category).toBe("INFRA");
  });

  it("categorizes disk space as INFRA", () => {
    const result = categorizeFailure(mockJob, mockStep, "Error: ENOSPC: no space left on device");
    expect(result.category).toBe("INFRA");
  });

  it("returns UNKNOWN for unrecognized failures", () => {
    const result = categorizeFailure(mockJob, mockStep, "Something unexpected happened");
    expect(result.category).toBe("UNKNOWN");
    expect(result.confidence).toBe("low");
  });

  it("handles empty log excerpt", () => {
    const result = categorizeFailure(mockJob, mockStep, "");
    expect(result.category).toBe("UNKNOWN");
  });

  it("uses step name for categorization", () => {
    const result = categorizeFailure(
      mockJob,
      { number: 1, name: "Run eslint check" },
      "found 5 linting errors"
    );
    expect(result.category).toBe("FIXABLE");
  });
});
