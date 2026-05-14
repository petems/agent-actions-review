import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, "..", "bin", "agent-actions-review.js");
const STUB = path.resolve(__dirname, "fixtures", "cli-fetch-stub.js");

function runDetail(extraArgs = []) {
  const args = [
    "--require",
    STUB,
    CLI,
    "detail",
    "12345678",
    "--branch",
    "feature-branch",
    ...extraArgs,
  ];
  const env = {
    ...process.env,
    GITHUB_TOKEN: "fake-token-for-tests",
    GH_REPO: "owner/repo",
  };
  delete env.HTTPS_PROXY;
  delete env.https_proxy;

  const result = spawnSync(process.execPath, args, {
    env,
    encoding: "utf8",
  });
  return result;
}

describe("detail --failures-only", () => {
  it("returns { run, failures } without a jobs key", () => {
    const { stdout, status } = runDetail(["--json", "--failures-only"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("run");
    expect(parsed).toHaveProperty("failures");
    expect(parsed).not.toHaveProperty("jobs");
    expect(Array.isArray(parsed.failures)).toBe(true);
    expect(parsed.failures.length).toBeGreaterThan(0);
  });
});

describe("detail --logs-only", () => {
  it("returns a flat array of { job, step, errors, tail }", () => {
    const { stdout, status } = runDetail(["--json", "--logs-only"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    for (const entry of parsed) {
      expect(entry).toHaveProperty("job");
      expect(entry).toHaveProperty("step");
      expect(entry).toHaveProperty("errors");
      expect(entry).toHaveProperty("tail");
      expect(typeof entry.job).toBe("string");
      expect(typeof entry.step).toBe("string");
      expect(Array.isArray(entry.errors)).toBe(true);
      expect(Array.isArray(entry.tail)).toBe(true);
    }
  });
});

describe("detail flag precedence", () => {
  it("--logs-only takes precedence when both flags are passed", () => {
    const { stdout, status } = runDetail(["--json", "--failures-only", "--logs-only"]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    // logs-only shape is a flat array, not an object with run/failures
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toHaveProperty("job");
    expect(parsed[0]).toHaveProperty("step");
    expect(parsed[0]).toHaveProperty("errors");
    expect(parsed[0]).toHaveProperty("tail");
  });
});

describe("detail flags without --json", () => {
  it("--failures-only is a no-op without --json", () => {
    const baseline = runDetail([]);
    const withFlag = runDetail(["--failures-only"]);
    expect(baseline.status).toBe(0);
    expect(withFlag.status).toBe(0);
    expect(withFlag.stdout).toBe(baseline.stdout);
  });

  it("--logs-only is a no-op without --json", () => {
    const baseline = runDetail([]);
    const withFlag = runDetail(["--logs-only"]);
    expect(baseline.status).toBe(0);
    expect(withFlag.status).toBe(0);
    expect(withFlag.stdout).toBe(baseline.stdout);
  });
});
