import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "..");
const packageMetadata = JSON.parse(readFileSync(resolve(workspaceRoot, "package.json"), "utf8"));
if (!/^\d+\.\d+\.\d+-alpha\.\d+$/u.test(packageMetadata.version)) {
  throw new Error("Private Alpha bundles require an explicit semantic prerelease version.");
}

const git = (args, encoding = "utf8") => {
  const result = spawnSync(
    "git",
    ["-c", `safe.directory=${workspaceRoot.replaceAll("\\", "/")}`, ...args],
    { cwd: workspaceRoot, encoding, shell: false },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || "Git command failed.");
  return result.stdout.trim();
};

if (git(["status", "--porcelain", "--untracked-files=no"])) {
  throw new Error("Commit tracked changes before building a Private Alpha bundle.");
}

const commit = git(["rev-parse", "HEAD"]);
const shortCommit = commit.slice(0, 12);
const outputDirectory = resolve(workspaceRoot, ".data", "releases");
mkdirSync(outputDirectory, { recursive: true });
const baseName = `relay-${packageMetadata.version}-${shortCommit}`;
const archivePath = resolve(outputDirectory, `${baseName}.zip`);
git(["archive", "--format=zip", "--prefix=relay/", `--output=${archivePath}`, "HEAD"]);

const digest = createHash("sha256").update(readFileSync(archivePath)).digest("hex");
writeFileSync(resolve(outputDirectory, `${baseName}.sha256`), `${digest}  ${baseName}.zip\n`);
writeFileSync(
  resolve(outputDirectory, `${baseName}.json`),
  `${JSON.stringify(
    {
      schema_version: 1,
      version: packageMetadata.version,
      commit,
      archive: `${baseName}.zip`,
      sha256: digest,
      generated_at: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);

process.stdout.write(
  `${JSON.stringify({ archive: archivePath, sha256: digest, commit, version: packageMetadata.version })}\n`,
);
