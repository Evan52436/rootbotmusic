import { config } from "./config";
import { MusicController } from "./core/MusicController";
import { WebServer } from "./web/WebServer";

async function bootstrap(): Promise<void> {
  const music = new MusicController();
  await music.init();

  const webServer = new WebServer(music);
  await webServer.start();

  const state = music.getState();
  if (state.virtualMic.active) {
    console.log(
      `[Audio] Virtual Mic ACTIVE -> Select "${state.virtualMic.micDescription}" as your Microphone in Root Voice Settings!`
    );
  } else {
    console.log(
      `[Audio] Audio output device: "${state.audioDevice}" (backend: ${state.audioBackend})`
    );
  }

  const hasRootHostEnv = Boolean(
    process.env.COMMUNITY_ID && process.env.BASE_URL
  );

  if (hasRootHostEnv) {
    try {
      const { startRootBot } = await import("./bot/RootBotHandler");
      await startRootBot(music);
    } catch (err) {
      const msg = (err as Error)?.message || String(err);
      console.error("[RootBot] Failed to connect to Root host:", msg);
      music.updateRootBotStatus({
        connected: false,
        mode: "root-devhost",
        error: msg,
      });
    }
  } else {
    music.updateRootBotStatus({
      connected: false,
      mode: "standalone",
    });
  }

  let shuttingDown = false;
  const cleanup = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n[Mulyo] Shutting down gracefully...");
    await webServer.stop().catch(() => {});
    await music.shutdown().catch(() => {});
    process.exit(0);
  };

  process.on("SIGINT", () => void cleanup());
  process.on("SIGTERM", () => void cleanup());
}

bootstrap().catch((err) => {
  console.error("[Mulyo] Fatal startup error:", err);
  process.exit(1);
});
