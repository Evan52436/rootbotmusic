import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";

const ROOT_DIR = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT_DIR, ".env") });

function resolveYtDlpBinary(): string {
  const isWin = process.platform === "win32";
  const localBin = path.join(ROOT_DIR, "bin", isWin ? "yt-dlp.exe" : "yt-dlp");
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  return "yt-dlp";
}

export const config = {
  rootDir: ROOT_DIR,
  dataDir: path.join(ROOT_DIR, "data"),
  publicDir: path.join(ROOT_DIR, "public"),
  ytDlpBin: resolveYtDlpBinary(),

  devToken: (process.env.DEV_TOKEN || "").trim(),
  isStandalone:
    process.env.MULYO_STANDALONE === "1" ||
    (!process.env.BASE_URL && !(process.env.DEV_TOKEN || "").trim()),

  botPrefix: (process.env.BOT_PREFIX || "/").trim() || "/",

  webHost: (process.env.WEB_HOST || "0.0.0.0").trim(),
  webPort: parseInt(process.env.WEB_PORT || "3456", 10) || 3456,
  publicWebUrl: (
    process.env.PUBLIC_WEB_URL ||
    `http://localhost:${parseInt(process.env.WEB_PORT || "3456", 10) || 3456}`
  ).trim(),

  autoCreateVirtualMic:
    (process.env.AUTO_CREATE_VIRTUAL_MIC || "false").toLowerCase() === "true",
  defaultVolume: Math.max(
    0,
    Math.min(150, parseInt(process.env.DEFAULT_VOLUME || "75", 10) || 75)
  ),
  explicitAudioDevice: (process.env.AUDIO_DEVICE || "").trim(),

  // Phase 2: Spotify configuration
  spotify: {
    enabled: (process.env.SPOTIFY_ENABLED || "false").toLowerCase() === "true",
    clientId: (process.env.SPOTIFY_CLIENT_ID || "").trim(),
    clientSecret: (process.env.SPOTIFY_CLIENT_SECRET || "").trim(),
  },
};
