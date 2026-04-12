import { describe, it, expect } from "vitest";
import {
  truncate,
  timeAgo,
  formatRunSummary,
  formatOutput,
} from "../lib/format.js";

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

describe("truncate", () => {
  it("returns string as-is if shorter than max", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates long strings with ellipsis", () => {
    expect(truncate("hello world this is long", 10)).toBe("hello w...");
  });

  it("collapses newlines to spaces", () => {
    expect(truncate("hello\nworld", 20)).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(truncate("", 10)).toBe("");
  });

  it("handles null/undefined", () => {
    expect(truncate(null, 10)).toBe("");
    expect(truncate(undefined, 10)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// timeAgo
// ---------------------------------------------------------------------------

describe("timeAgo", () => {
  it("returns empty string for null input", () => {
    expect(timeAgo(null)).toBe("");
    expect(timeAgo("")).toBe("");
  });

  it("formats seconds ago", () => {
    const date = new Date(Date.now() - 30000).toISOString();
    expect(timeAgo(date)).toMatch(/\d+s ago/);
  });

  it("formats minutes ago", () => {
    const date = new Date(Date.now() - 300000).toISOString();
    expect(timeAgo(date)).toMatch(/\d+m ago/);
  });

  it("formats hours ago", () => {
    const date = new Date(Date.now() - 7200000).toISOString();
    expect(timeAgo(date)).toMatch(/\d+h ago/);
  });

  it("formats days ago", () => {
    const date = new Date(Date.now() - 172800000).toISOString();
    expect(timeAgo(date)).toMatch(/\d+d ago/);
  });
});

// ---------------------------------------------------------------------------
// formatRunSummary
// ---------------------------------------------------------------------------

describe("formatRunSummary", () => {
  it("includes run id, name, and status", () => {
    const run = {
      id: 12345,
      name: "CI",
      status: "completed",
      conclusion: "success",
      branch: "main",
      sha: "abc1234",
      createdAt: new Date().toISOString(),
    };
    const result = formatRunSummary(run);
    expect(result).toContain("[12345]");
    expect(result).toContain("CI");
    expect(result).toContain("success");
  });

  it("includes branch and sha", () => {
    const run = {
      id: 1,
      name: "Build",
      status: "completed",
      conclusion: "failure",
      branch: "feature-x",
      sha: "def5678",
      createdAt: new Date().toISOString(),
    };
    const result = formatRunSummary(run);
    expect(result).toContain("feature-x");
    expect(result).toContain("def5678");
  });
});

// ---------------------------------------------------------------------------
// formatOutput
// ---------------------------------------------------------------------------

describe("formatOutput", () => {
  it("returns JSON when json option is true", () => {
    const data = [{ id: 1, name: "test" }];
    const result = formatOutput(data, { json: true });
    expect(JSON.parse(result)).toEqual(data);
  });

  it("returns message for empty array", () => {
    const result = formatOutput([], { json: false });
    expect(result).toContain("No workflow runs found");
  });

  it("includes status filter in empty message", () => {
    const result = formatOutput([], { json: false, status: "failure" });
    expect(result).toContain("failure");
  });

  it("formats non-empty arrays as run summaries", () => {
    const runs = [
      {
        id: 1,
        name: "CI",
        status: "completed",
        conclusion: "success",
        branch: "main",
        sha: "abc",
        createdAt: new Date().toISOString(),
      },
    ];
    const result = formatOutput(runs, { json: false });
    expect(result).toContain("Found 1 workflow run");
  });
});
