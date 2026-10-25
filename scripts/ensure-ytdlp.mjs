#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const binDir = path.join(rootDir, "bin");
const isWin = process.platform === "win32";
const localBin = path.join(binDir, isWin ? "yt-dlp.exe" : "yt-dlp");

function hasSystemYtDlp() {
  try {
    execFileSync(isWin ? "where" : "which", ["yt-dlp"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getReleaseAssetName() {
  if (process.platform === "win32") return "yt-dlp.exe";
  if (process.platform === "darwin") return "yt-dlp_macos";
  if (process.arch === "arm64") return "yt-dlp_linux_aarch64";
  return "yt-dlp_linux";
}

async function main() {
  if (fs.existsSync(localBin)) {
    console.log(`[setup] Local yt-dlp binary ready at ${localBin}`);
    return;
  }
  if (hasSystemYtDlp()) {
    console.log("[setup] System yt-dlp detected on PATH.");
    return;
  }

  const asset = getReleaseAssetName();
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
  console.log(`[setup] Downloading standalone ${asset} into ./bin/ ...`);

  try {
    fs.mkdirSync(binDir, { recursive: true });
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(localBin, Buffer.from(arrayBuffer));
    if (!isWin) {
      fs.chmodSync(localBin, 0o755);
    }
    console.log(`[setup] Installed standalone yt-dlp to ${localBin}`);
  } catch (err) {
    console.warn(
      `[setup] Warning: Could not auto-download yt-dlp (${err?.message || err}). ` +
        `Install yt-dlp manually or run "npm run setup:ytdlp" with internet access.`
    );
  }
}

main();
