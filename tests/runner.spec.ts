/**
 * Runner tests against a small local site, so they do not depend on the internet.
 */
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { TestCaseInput } from "../src/lib/test-cases/format";
import { runTestCases } from "../src/runner/run";
import type { BrowserName } from "../src/runner/types";

const LOGIN_PAGE = `<!doctype html><title>Practice login</title>
<form id="form"><label>User <input id="user"></label>
<label>Plan <select id="plan"><option value="free">Free</option><option value="pro">Pro</option></select></label>
<label><input type="checkbox" id="terms"> Terms</label><button type="submit">Sign in</button></form>
<p id="message"></p>
<script>
document.getElementById("form").addEventListener("submit", (e) => {
  e.preventDefault();
  const ok = document.getElementById("user").value === "ada" && document.getElementById("terms").checked;
  document.getElementById("message").textContent = ok ? "Welcome, ada on " + document.getElementById("plan").value : "Try again";
  if (ok) history.pushState({}, "", "/home");
});
</script>`;

// The runner records its own traces; the test runner's automatic tracing would clash with it.
test.use({ trace: "off", screenshot: "off" });

let server: Server;
let baseUrl: string;
let outputDir: string;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/login") return res.writeHead(200, { "Content-Type": "text/html" }).end(LOGIN_PAGE);
    if (req.url === "/api/health") return res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
    res.writeHead(404).end("Not found");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  outputDir = await mkdtemp(join(tmpdir(), "runner-test-"));
});

test.afterAll(async () => {
  server.close();
  await rm(outputDir, { recursive: true, force: true });
});

const run = (testCases: TestCaseInput[], browsers: BrowserName[] = ["chrome"], withBaseUrl = true) =>
  runTestCases({ testCases, browsers, headless: true, outputDir, baseUrl: withBaseUrl ? baseUrl : undefined, stepTimeoutMs: 1500 });

const login = (message: string): TestCaseInput => ({
  id: "TC-LOGIN",
  name: "User can sign in",
  steps: [
    { action: "open", target: "/login" },
    { action: "expect_title", value: "Practice login" },
    { action: "fill", target: "#user", value: "ada" },
    { action: "select", target: "#plan", value: "Pro" },
    { action: "check", target: "#terms" },
    { action: "click", target: "button[type=submit]" },
    { action: "expect_text", target: "#message", value: message },
    { action: "expect_url", value: "/home" },
  ],
});

test("a test where every step works passes", async () => {
  const result = await run([
    login("Welcome, ada on pro"),
    { id: "TC-API", name: "Health check", steps: [{ action: "api_request", target: `${baseUrl}/api/health` }, { action: "expect_status", value: "200" }] },
  ]);
  expect(result.summary).toEqual({ total: 2, passed: 2, failed: 0, blocked: 0 });
  expect(result.results[0].steps.every((step) => step.status === "passed")).toBe(true);
  expect(result.results[0].screenshot).toBeUndefined();
});

test("a check that does not hold fails the test and keeps a screenshot and trace", async () => {
  const [result] = (await run([login("Welcome, grace")])).results;
  expect(result.status).toBe("failed");
  expect(result.failedStep).toBe(7);
  expect(result.error).toBe('Expected #message to contain "Welcome, grace", but it showed "Welcome, ada on pro".');
  expect(result.steps.map((s) => s.status)).toEqual(["passed", "passed", "passed", "passed", "passed", "passed", "failed", "skipped"]);
  expect(existsSync(join(outputDir, result.screenshot!))).toBe(true);
  expect(existsSync(join(outputDir, result.trace!))).toBe(true);
});

test("a step that cannot run blocks the test", async () => {
  const [missing, noBase] = [
    (await run([{ id: "TC-1", name: "Missing button", steps: [{ action: "open", target: "/login" }, { action: "click", target: "#does-not-exist" }] }])).results[0],
    (await run([{ id: "TC-2", name: "Needs base URL", steps: [{ action: "open", target: "/login" }] }], ["chrome"], false)).results[0],
  ];
  expect(missing.status).toBe("blocked");
  expect(missing.error).toBe("Timed out waiting for locator('#does-not-exist').");
  expect(noBase.status).toBe("blocked");
  expect(noBase.error).toContain("needs a base URL");
});

test("a wrong API status fails, and a status check without a request is blocked", async () => {
  const { results } = await run([
    { id: "TC-404", name: "Missing page", steps: [{ action: "api_request", target: `${baseUrl}/nope` }, { action: "expect_status", value: "200" }] },
    { id: "TC-NOREQ", name: "No request", steps: [{ action: "expect_status", value: "200" }] },
  ]);
  expect(results.map((r) => [r.status, r.error])).toEqual([
    ["failed", "Expected API status 200, but it was 404."],
    ["blocked", "There is no API response to check. Add an api_request step before expect_status."],
  ]);
});

test("runs in Firefox", async () => {
  const result = await run([login("Welcome, ada on pro")], ["firefox"]);
  expect(result.results[0]).toMatchObject({ browser: "firefox", status: "passed" });
});

test("a browser that is not installed blocks its tests with the reason", async () => {
  test.skip(existsSync("/Applications/Microsoft Edge.app"), "Edge is installed on this machine");
  const result = await run([login("Welcome, ada on pro")], ["edge"]);
  expect(result.results[0].status).toBe("blocked");
  expect(result.results[0].error).toMatch(/^Microsoft Edge could not be started/);
});
