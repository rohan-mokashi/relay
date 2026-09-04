import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(workspaceRoot, path), "utf8");
const metadata = JSON.parse(read("package.json"));
const pluginMetadata = JSON.parse(read("plugin/relay/.codex-plugin/plugin.json"));

assert.match(metadata.version, /^\d+\.\d+\.\d+-alpha\.\d+$/u);
assert.equal(metadata.scripts["open-alpha:check"], "node scripts/open-alpha-check.mjs");
assert.equal(pluginMetadata.version, metadata.version, "Plugin and package versions differ.");
assert.match(
  read("apps/mcp-server/src/mcp.ts"),
  new RegExp(`name: "relay", version: "${metadata.version.replaceAll(".", "\\.")}"`, "u"),
  "MCP server and package versions differ.",
);
assert.match(read("scripts/verify.mjs"), /"open-alpha:check"/u);

for (const path of [
  "OPEN_ALPHA_SPEC.md",
  "SECURITY.md",
  "docs/open-alpha/README.md",
  "docs/open-alpha/operator-checklist.md",
  "docs/open-alpha/recruitment-post.md",
  "docs/open-alpha/release-notes.md",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/open-alpha-application.yml",
  ".github/ISSUE_TEMPLATE/open-alpha-result.yml",
  ".github/ISSUE_TEMPLATE/support-report.yml",
  ".github/workflows/verify.yml",
]) {
  assert.ok(read(path).trim(), `${path} is empty`);
}

const specification = read("OPEN_ALPHA_SPEC.md");
assert.match(specification, /exactly nine project-state tools/u);
assert.match(specification, /must not be\s+placed directly on the public internet/u);
assert.match(specification, /owner-approved license/u);
assert.match(specification, /Do\s+not label Relay a Public Beta/u);

const overview = read("docs/open-alpha/README.md");
assert.match(overview, /GitHub username are public/u);
assert.match(overview, /has no product telemetry/u);
assert.match(overview, /private vulnerability-reporting/u);

const application = read(".github/ISSUE_TEMPLATE/open-alpha-application.yml");
assert.match(application, /not a production-ready Public Beta/u);
assert.match(application, /will not expose a development server publicly/u);
assert.match(application, /private repository details, credentials, tokens/u);

const result = read(".github/ISSUE_TEMPLATE/open-alpha-result.yml");
for (const field of [
  "onboarding-minutes",
  "continuation-minutes",
  "repeated-context-items",
  "incorrect-assumptions",
  "criteria-total",
  "criteria-completed",
  "trust-rating",
  "second-project",
  "support-requests",
]) {
  assert.match(result, new RegExp(`id: ${field}`, "u"), `Result form is missing ${field}.`);
}
assert.doesNotMatch(result, /id: (project|capsule|repository|chat)/u);

const support = read(".github/ISSUE_TEMPLATE/support-report.yml");
assert.match(support, /Report security concerns through GitHub private vulnerability reporting/u);
assert.match(support, /pnpm alpha:doctor/u);

const issueConfiguration = read(".github/ISSUE_TEMPLATE/config.yml");
assert.match(issueConfiguration, /blank_issues_enabled: false/u);
assert.match(issueConfiguration, /security\/advisories\/new/u);
assert.match(read("SECURITY.md"), /security\/advisories\/new/u);
assert.match(read("docs/open-alpha/release-notes.md"), new RegExp(metadata.version, "u"));
assert.match(read(".gitignore"), /^\.data\/$/mu);
assert.match(read("scripts/secret-scan.mjs"), /safe\.directory=/u);

const workflow = read(".github/workflows/verify.yml");
assert.match(workflow, /runs-on: windows-latest/u);
assert.match(workflow, /run: pnpm verify/u);
assert.doesNotMatch(workflow, /uses: [^\s]+@(main|master|v\d+)\s*$/mu);

process.stdout.write(
  `Open Alpha public intake, support, safety, and ${metadata.version} release checks passed.\n`,
);
