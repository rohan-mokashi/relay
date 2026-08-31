import { spawnSync } from "node:child_process";

const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const checks = [
  "lint",
  "format:check",
  "typecheck",
  "build",
  "migrate:check",
  "plugin:check",
  "test",
  "secret:scan",
  "audit",
];

for (const check of checks) {
  process.stdout.write(`\n==> pnpm ${check}\n`);
  const result = spawnSync(executable, [check], {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.stdout.write("\nRelay verification suite passed.\n");
