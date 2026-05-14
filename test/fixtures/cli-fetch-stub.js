/**
 * Preload script that replaces `globalThis.fetch` with a deterministic stub
 * for CLI tests. The CLI's `getProxyFetch()` returns `globalThis.fetch` when
 * `HTTPS_PROXY` is unset, so installing the stub here (via `node --require`)
 * intercepts every API call made by the `detail` command.
 */

const RUN = {
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

const JOBS = [
  {
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
      },
      {
        number: 2,
        name: "Run tests",
        status: "completed",
        conclusion: "failure",
      },
    ],
  },
];

const LOG_TEXT = [
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

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function textResponse(body) {
  return {
    ok: true,
    status: 200,
    async json() {
      return JSON.parse(body);
    },
    async text() {
      return body;
    },
  };
}

globalThis.fetch = async (url) => {
  const u = String(url);
  if (/\/actions\/runs\/12345678\/jobs/.test(u)) {
    return jsonResponse({ jobs: JOBS });
  }
  if (/\/actions\/runs\/12345678$/.test(u)) {
    return jsonResponse(RUN);
  }
  if (/\/actions\/jobs\/87654321\/logs$/.test(u)) {
    return textResponse(LOG_TEXT);
  }
  return {
    ok: false,
    status: 404,
    async json() {
      return { message: `Unmatched URL: ${u}` };
    },
    async text() {
      return `Unmatched URL: ${u}`;
    },
  };
};
