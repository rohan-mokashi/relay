import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const replaceSetting = (template, name, value) => {
  const expression = new RegExp(`^${name}=.*$`, "mu");
  if (!expression.test(template)) throw new Error(`.env.example is missing ${name}.`);
  return template.replace(expression, `${name}=${value}`);
};

export const renderPrivateAlphaEnvironment = (
  template,
  workspaceRoot,
  randomBytesFunction = randomBytes,
) => {
  const token = `relay_dev_${randomBytesFunction(32).toString("base64url")}`;
  const principal = `relay-alpha-${randomBytesFunction(8).toString("hex")}`;
  const databasePath = join(workspaceRoot, ".data", "relay.db").replaceAll("\\", "/");
  let rendered = template;
  for (const [name, value] of [
    ["RELAY_AUTH_MODE", "dev"],
    ["RELAY_PERSISTENCE", "sqlite"],
    ["RELAY_DATABASE_PATH", databasePath],
    ["RELAY_DEV_TOKEN", token],
    ["RELAY_DEV_PRINCIPAL", principal],
    ["RELAY_DEV_TOKENS_JSON", ""],
    ["RELAY_TUNNEL_PRINCIPAL", principal],
  ]) {
    rendered = replaceSetting(rendered, name, value);
  }
  return rendered.endsWith("\n") ? rendered : `${rendered}\n`;
};

export const provisionPrivateAlphaEnvironment = (
  workspaceRoot,
  randomBytesFunction = randomBytes,
) => {
  const environmentPath = join(workspaceRoot, ".env");
  if (existsSync(environmentPath)) return { created: false, path: environmentPath };
  const template = readFileSync(join(workspaceRoot, ".env.example"), "utf8");
  const rendered = renderPrivateAlphaEnvironment(template, workspaceRoot, randomBytesFunction);
  writeFileSync(environmentPath, rendered, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return { created: true, path: environmentPath };
};

export const resolvePnpmCommand = (
  args,
  {
    packageManagerEntry = process.env.npm_execpath,
    platform = process.platform,
    commandShell = process.env.ComSpec,
  } = {},
) => {
  if (packageManagerEntry) {
    return { executable: process.execPath, arguments: [packageManagerEntry, ...args] };
  }
  if (platform === "win32") {
    if (!args.every((argument) => /^[A-Za-z0-9:._-]+$/u.test(argument))) {
      throw new Error("Refusing to pass an unsafe argument to the Windows pnpm launcher.");
    }
    return {
      executable: commandShell || "cmd.exe",
      arguments: ["/d", "/s", "/c", `pnpm ${args.join(" ")}`],
    };
  }
  return { executable: "pnpm", arguments: args };
};

const runPnpm = (workspaceRoot, args) => {
  const command = resolvePnpmCommand(args);
  const result = spawnSync(command.executable, command.arguments, {
    cwd: workspaceRoot,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const main = () => {
  const workspaceRoot = resolve(import.meta.dirname, "..");
  const environment = provisionPrivateAlphaEnvironment(workspaceRoot);
  process.stdout.write(
    environment.created
      ? "Created ignored local configuration in .env; credential values were not printed.\n"
      : "Preserved the existing .env configuration.\n",
  );
  runPnpm(workspaceRoot, ["install", "--frozen-lockfile"]);
  runPnpm(workspaceRoot, ["migrate"]);
  runPnpm(workspaceRoot, ["alpha:doctor"]);
  process.stdout.write(
    "Private Alpha setup passed. Continue with docs/private-alpha/tester-quickstart.md.\n",
  );
};

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Private Alpha setup failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
