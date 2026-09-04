import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";

const checks = [];
const record = (status, label, detail) => checks.push({ status, label, detail });

const findOnPath = (names) => {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    for (const name of names) {
      const candidate = join(directory.replace(/^"|"$/g, ""), name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
};

const windowsCodeInstallations = () => {
  const pathWrapper = findOnPath(["code.cmd"]);
  return [
    pathWrapper ? dirname(dirname(pathWrapper)) : undefined,
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Programs", "Microsoft VS Code")
      : undefined,
    process.env.ProgramFiles ? join(process.env.ProgramFiles, "Microsoft VS Code") : undefined,
    process.env["ProgramFiles(x86)"]
      ? join(process.env["ProgramFiles(x86)"], "Microsoft VS Code")
      : undefined,
  ].filter(Boolean);
};

const findWindowsCodeCli = () => {
  for (const installation of windowsCodeInstallations()) {
    const executable = join(installation, "Code.exe");
    if (!existsSync(executable)) continue;
    for (const entry of readdirSync(installation, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const cli = join(installation, entry.name, "resources", "app", "out", "cli.js");
      if (existsSync(cli)) return { executable, cli };
    }
  }
  return undefined;
};

const findBundledCopilot = () => {
  if (process.platform !== "win32") return undefined;
  for (const installation of windowsCodeInstallations()) {
    if (!existsSync(installation)) continue;
    for (const entry of readdirSync(installation, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packagePath = join(
        installation,
        entry.name,
        "resources",
        "app",
        "extensions",
        "copilot",
        "package.json",
      );
      if (!existsSync(packagePath)) continue;
      const metadata = JSON.parse(readFileSync(packagePath, "utf8"));
      if (
        metadata.publisher?.toLowerCase() === "github" &&
        metadata.name?.toLowerCase() === "copilot-chat"
      ) {
        return metadata.version;
      }
    }
  }
  return undefined;
};

const runCode = (args) => {
  if (process.platform === "win32") {
    const command = findWindowsCodeCli();
    if (!command) return undefined;
    return spawnSync(command.executable, [command.cli, ...args], {
      encoding: "utf8",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", VSCODE_DEV: "" },
      windowsHide: true,
    });
  }
  const executable = findOnPath(["code"]);
  if (!executable) return undefined;
  return spawnSync(executable, args, { encoding: "utf8" });
};

const portableConfigPath = join(process.cwd(), ".mcp.json");
if (existsSync(portableConfigPath)) {
  record("PASS", "portable MCP configuration", ".mcp.json is present");
} else {
  record("FAIL", "portable MCP configuration", ".mcp.json is missing");
}

const workspaceConfigPath = join(process.cwd(), ".vscode", "mcp.json");
if (existsSync(workspaceConfigPath)) {
  record("PASS", "VS Code workspace MCP configuration", ".vscode/mcp.json is present");
} else {
  record("FAIL", "VS Code workspace MCP configuration", ".vscode/mcp.json is missing");
}

const launcherPath = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
if (existsSync(launcherPath)) {
  record("PASS", "repository dependencies", "the configured tsx launcher is installed");
} else {
  record("FAIL", "repository dependencies", "run pnpm install --frozen-lockfile");
}

const envPath = join(process.cwd(), ".env");
if (!existsSync(envPath)) {
  record("FAIL", "ignored local environment", "copy .env.example to .env");
} else {
  const envText = readFileSync(envPath, "utf8");
  const hasValue = (name) => new RegExp(`^\\s*${name}\\s*=\\s*(?!#|$).+`, "m").test(envText);
  record(
    hasValue("RELAY_TUNNEL_PRINCIPAL") ? "PASS" : "FAIL",
    "trusted stdio principal",
    hasValue("RELAY_TUNNEL_PRINCIPAL")
      ? "RELAY_TUNNEL_PRINCIPAL is set (value withheld)"
      : "set RELAY_TUNNEL_PRINCIPAL in .env",
  );
  record(
    hasValue("RELAY_DATABASE_PATH") ? "PASS" : "FAIL",
    "shared database path",
    hasValue("RELAY_DATABASE_PATH")
      ? "RELAY_DATABASE_PATH is set (value withheld)"
      : "set RELAY_DATABASE_PATH in .env",
  );
}

const version = runCode(["--version"]);
if (version?.status !== 0) {
  record("FAIL", "Visual Studio Code", "the code command is unavailable");
} else {
  const firstLine = version.stdout.trim().split(/\r?\n/u)[0] ?? "unknown";
  record("PASS", "Visual Studio Code", `version ${firstLine}`);
}

const installed = runCode(["--list-extensions"]);
if (installed?.status !== 0) {
  record("PENDING", "independent VS Code agent", "extension inventory was unavailable");
} else {
  const extensionIds = new Set(
    installed.stdout
      .split(/\r?\n/u)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const bundledCopilotVersion = findBundledCopilot();
  const copilotInstalled =
    extensionIds.has("github.copilot") ||
    extensionIds.has("github.copilot-chat") ||
    Boolean(bundledCopilotVersion);
  record(
    copilotInstalled ? "PASS" : "PENDING",
    "independent VS Code agent",
    copilotInstalled
      ? bundledCopilotVersion
        ? `GitHub Copilot ${bundledCopilotVersion} is bundled with VS Code; sign-in is not checked`
        : "GitHub Copilot agent extension is installed; sign-in is not checked"
      : "no GitHub Copilot agent extension detected; provider selection/install requires operator approval",
  );
}

for (const check of checks) {
  process.stdout.write(`${check.status.padEnd(7)} ${check.label}: ${check.detail}\n`);
}

if (checks.some((check) => check.status === "FAIL")) {
  process.stdout.write(
    "\nPreflight is not ready. Resolve FAIL items, then make the explicit provider/trust decisions for PENDING items.\n",
  );
  process.exitCode = 2;
} else if (checks.some((check) => check.status === "PENDING")) {
  process.stdout.write(
    "\nAutomated preflight passed. The PENDING provider and MCP trust decisions require operator approval.\n",
  );
  process.exitCode = 2;
} else {
  process.stdout.write(
    "\nPreflight is ready. Visual Studio Code sign-in and MCP trust still require operator confirmation.\n",
  );
}
