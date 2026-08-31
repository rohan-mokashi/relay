import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  ".npm-cache",
  ".pnpm",
  ".pnpm-store",
  ".tools",
  ".data",
  "coverage",
  "dist",
  "node_modules",
]);
const textExtensions = new Set([
  "",
  ".json",
  ".md",
  ".mjs",
  ".ps1",
  ".sql",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
]);
const patterns = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\b(?:ghp|github_pat)_[A-Za-z0-9_]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
];

const tracked = new Set(
  execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => file.replaceAll("\\", "/")),
);
for (const file of tracked) {
  if (/(?:^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith(".env.example")) {
    process.stderr.write(`Secret scan failed: tracked environment file ${file}.\n`);
    process.exit(1);
  }
}

const findings = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) walk(resolve(directory, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    const path = resolve(directory, entry.name);
    const name = relative(root, path).replaceAll("\\", "/");
    if (entry.name.startsWith(".env") && entry.name !== ".env.example") continue;
    if (!textExtensions.has(extname(entry.name).toLowerCase())) continue;
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (patterns.some((pattern) => pattern.test(line))) findings.push(`${name}:${index + 1}`);
    });
  }
};

walk(root);
if (findings.length > 0) {
  process.stderr.write(`Secret scan found credential-like content at:\n${findings.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(
  "Secret scan passed; no credential-like content found in repository text files.\n",
);
