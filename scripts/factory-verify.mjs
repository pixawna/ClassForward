import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Run in the checked-out ClassForward repository. Never read or copy .env files.
const startedAt = new Date().toISOString();
const folder = resolve(".factory-runs", startedAt.replaceAll(":", "-"));
mkdirSync(folder, { recursive: true });
const git = (...args) => spawnSync("git", args, { encoding: "utf8" }).stdout?.trim() ?? "";
const report = {
  startedAt,
  commit: git("rev-parse", "HEAD"),
  branch: git("branch", "--show-current"),
  dirty: Boolean(git("status", "--porcelain")),
  checks: [],
  passed: false,
};
// The Scrapy source finder's tests run offline against a local fake site.
const python =
  process.env.SCRAPER_PYTHON ||
  [resolve("scraper/.venv/bin/python"), resolve("scraper/.venv/Scripts/python.exe")].find((p) => existsSync(p)) ||
  "python3";
const checks = [
  ["scraper-tests", python, ["-m", "unittest", "discover", "-s", "scraper/tests"]],
  ["lint", "npm", ["run", "lint"]],
  ["component-tests", "npm", ["test"]],
  ["route-types", "npm", ["exec", "--", "next", "typegen"]],
  ["typecheck", "npm", ["run", "typecheck"]],
  ["build", "npm", ["run", "build"]],
];
for (const [name, command, args] of checks) {
  console.log(`Running ${name}...`);
  const before = Date.now();
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? String(result.error) : ""}`;
  writeFileSync(resolve(folder, `${name}.log`), output);
  const passed = result.status === 0 && !result.error;
  report.checks.push({ name, passed, exitCode: result.status, signal: result.signal, durationMs: Date.now() - before });
  console.log(`${name}: ${passed ? "passed" : "FAILED"}`);
  if (!passed) {
    console.error(output);
    break;
  }
}
report.passed = report.checks.length === checks.length && report.checks.every((check) => check.passed);
writeFileSync(resolve(folder, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`Verification evidence: ${folder}`);
process.exitCode = report.passed ? 0 : 1;
