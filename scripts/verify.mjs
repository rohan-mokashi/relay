import { spawnSync } from "node:child_process";

// Reuse the package-manager entry point that launched this script. Spawning a
// Windows .cmd shim directly is not supported consistently across Node builds.
const packageManagerEntry = process.env.npm_execpath;
if (!packageManagerEntry) {
  throw new Error("Run this verifier through `pnpm verify`.");
}
const checks = [
  "lint",
  "format:check",
  "typecheck",
  "build",
  "migrate:check",
  "clients:check",
  "plugin:check",
  "test",
  "secret:scan",
  "audit",
];

for (const check of checks) {
  process.stdout.write(`\n==> pnpm ${check}\n`);
  const result = spawnSync(process.execPath, [packageManagerEntry, check], {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write("\nRelay verification suite passed.\n");
