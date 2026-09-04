import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  provisionPrivateAlphaEnvironment,
  renderPrivateAlphaEnvironment,
} from "./private-alpha-setup.mjs";

const workspaceRoot = resolve(import.meta.dirname, "..");
const metadata = JSON.parse(readFileSync(resolve(workspaceRoot, "package.json"), "utf8"));
assert.match(metadata.version, /^\d+\.\d+\.\d+-alpha\.\d+$/u);
for (const script of [
  "alpha:setup",
  "alpha:doctor",
  "alpha:metrics",
  "alpha:bundle",
  "alpha:check",
]) {
  assert.equal(typeof metadata.scripts[script], "string", `package.json is missing ${script}`);
}

for (const path of [
  "PRIVATE_ALPHA_SPEC.md",
  "docs/private-alpha/tester-quickstart.md",
  "docs/private-alpha/operator-runbook.md",
  "docs/private-alpha/metrics.md",
  "docs/private-alpha/support-and-incidents.md",
  "docs/private-alpha/exit-scorecard.md",
  "docs/private-alpha/alpha-observations.example.jsonl",
]) {
  assert.ok(readFileSync(resolve(workspaceRoot, path), "utf8").trim(), `${path} is empty`);
}

for (const path of [
  "scripts/private-alpha-setup.mjs",
  "scripts/private-alpha-doctor.mjs",
  "scripts/private-alpha-bundle.mjs",
  "scripts/private-alpha-check.mjs",
]) {
  const result = spawnSync(process.execPath, ["--check", path], {
    cwd: workspaceRoot,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr);
}

const temporaryWorkspace = mkdtempSync(join(tmpdir(), "relay-alpha-check-"));
try {
  copyFileSync(resolve(workspaceRoot, ".env.example"), join(temporaryWorkspace, ".env.example"));
  const deterministicBytes = (size) => Buffer.alloc(size, 0xab);
  const template = readFileSync(join(temporaryWorkspace, ".env.example"), "utf8");
  const rendered = renderPrivateAlphaEnvironment(template, temporaryWorkspace, deterministicBytes);
  assert.match(rendered, /^RELAY_DEV_TOKEN=relay_dev_[A-Za-z0-9_-]{40,}$/mu);
  assert.match(rendered, /^RELAY_TUNNEL_PRINCIPAL=relay-alpha-[a-f0-9]{16}$/mu);
  assert.doesNotMatch(rendered, /^RELAY_DEV_TOKEN=$/mu);

  const first = provisionPrivateAlphaEnvironment(temporaryWorkspace, deterministicBytes);
  const firstContent = readFileSync(first.path, "utf8");
  const second = provisionPrivateAlphaEnvironment(temporaryWorkspace, deterministicBytes);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(readFileSync(second.path, "utf8"), firstContent);
} finally {
  rmSync(temporaryWorkspace, { recursive: true, force: true });
}

process.stdout.write(
  "Private Alpha package, documentation, script syntax, and non-destructive setup checks passed.\n",
);
