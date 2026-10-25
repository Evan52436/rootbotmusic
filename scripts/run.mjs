#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function parseEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    result[key] = val;
  }
  return result;
}

const fileEnv = parseEnvFile(path.join(rootDir, ".env"));
const devToken = (process.env.DEV_TOKEN ?? fileEnv.DEV_TOKEN ?? "").trim();

const entryFile = path.join(rootDir, "dist", "main.js");
if (!fs.existsSync(entryFile)) {
  console.log("[runner] Building TypeScript server...");
  execSync("npm run build:server", { cwd: rootDir, stdio: "inherit" });
}

const webDistHtml = path.join(rootDir, "web", "dist", "index.html");
const publicHtml = path.join(rootDir, "public", "index.html");
if (!fs.existsSync(webDistHtml) && !fs.existsSync(publicHtml)) {
  console.log("[runner] Building Web UI SPA dashboard...");
  execSync("npm --prefix web run build", { cwd: rootDir, stdio: "inherit" });
}

let child;
if (devToken && devToken.length > 30 && devToken !== "your_generated_dev_token_here") {
  console.log("[runner] DEV_TOKEN found -> Launching via Root SDK DevHost (@rootsdk/server-bot + Web UI)...");
  const rootsdkBin = path.join(
    rootDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "rootsdk.cmd" : "rootsdk"
  );
  child = spawn(rootsdkBin, ["start", "devhost"], {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env },
  });
} else {
  console.log(
    "[runner] No DEV_TOKEN set in .env -> Starting in Standalone Mode (Web Dashboard + Audio Engine + Virtual Mic active)."
  );
  console.log(
    "[runner] Tip: Add your Root DEV_TOKEN to .env anytime and restart to enable live Root Chat commands!\n"
  );
  child = spawn(process.execPath, [entryFile], {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, MULYO_STANDALONE: "1" },
  });
}

const forwardSignal = (sig) => {
  if (child && !child.killed) {
    child.kill(sig);
  }
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
