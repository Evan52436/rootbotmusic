import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import cors from "cors";
import express, { Request, Response } from "express";
import { WebSocket, WebSocketServer } from "ws";
import { config } from "../config";
import { MusicController } from "../core/MusicController";
import { LyricsService } from "../services/LyricsService";
import { LoopMode, MusicSource, SearchFilter, Track } from "../types/music";

export class WebServer {
  private readonly app = express();
  private readonly server: http.Server;
  private readonly wss: WebSocketServer;
  private readonly lyricsService: LyricsService;

  constructor(private readonly music: MusicController) {
    this.lyricsService = new LyricsService(this.music.providers.ytMusic);
    this.app.use(cors());
    this.app.use(express.json({ limit: "2mb" }));

    this.registerApiRoutes();
    this.registerStaticSpa();

    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server, path: "/ws" });
    this.setupWebSockets();
  }

  private setupWebSockets(): void {
    const broadcastJson = (payload: unknown) => {
      const serialized = JSON.stringify(payload);
      for (const client of this.wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(serialized);
        }
      }
    };

    const broadcastClientCount = () => {
      broadcastJson({ type: "clients", count: this.wss.clients.size });
    };

    this.wss.on("connection", (ws: WebSocket) => {
      ws.send(JSON.stringify({ type: "state", data: this.music.getState() }));
      broadcastClientCount();

      ws.on("close", () => {
        broadcastClientCount();
      });
    });

    this.music.on("state", (state) => {
      broadcastJson({ type: "state", data: state });
    });

    this.music.on("progress", (progress) => {
      broadcastJson({ type: "progress", data: progress });
    });
  }

  private registerApiRoutes(): void {
    this.app.get("/api/health", (_req: Request, res: Response) => {
      res.json({ ok: true, state: this.music.getState() });
    });

    this.app.get("/api/state", (_req: Request, res: Response) => {
      res.json(this.music.getState());
    });

    this.app.get("/api/search", async (req: Request, res: Response) => {
      try {
        const q = String(req.query.q || "").trim();
        const source = (String(req.query.source || "ytmusic") as MusicSource) || "ytmusic";
        const filter = (String(req.query.filter || "songs") as SearchFilter) || "songs";
        const limit = Math.min(30, Math.max(1, parseInt(String(req.query.limit || "16"), 10) || 16));

        if (!q) {
          res.json({ tracks: [] });
          return;
        }
        const tracks = await this.music.search(q, source, filter, limit);
        res.json({ tracks });
      } catch (err) {
        res.status(400).json({
          error: (err as Error)?.message || "Search failed",
        });
      }
    });

    this.app.post("/api/queue/add", async (req: Request, res: Response) => {
      try {
        const {
          tracks,
          query,
          requestedBy = "Web User",
          playImmediately = false,
          source = "ytmusic",
        } = req.body as {
          tracks?: Track[];
          query?: string;
          requestedBy?: string;
          playImmediately?: boolean;
          source?: MusicSource;
        };

        if (Array.isArray(tracks) && tracks.length > 0) {
          const result = await this.music.enqueueTracks(tracks, {
            requestedBy,
            requestedVia: "web",
            playImmediately: Boolean(playImmediately),
          });
          res.json({
            ok: true,
            isPlaylist: tracks.length > 1,
            startedNow: result.startedNow,
            addedCount: result.added.length,
          });
          return;
        }

        if (typeof query === "string" && query.trim()) {
          const result = await this.music.playQueryOrUrl(query.trim(), {
            requestedBy,
            requestedVia: "web",
            playImmediately: Boolean(playImmediately),
            preferredSource: source,
          });
          res.json({
            ok: true,
            isPlaylist: result.isPlaylist,
            playlistTitle: result.playlistTitle,
            startedNow: result.startedNow,
            addedCount: result.added.length,
          });
          return;
        }

        res.status(400).json({ error: "Provide either 'tracks' or 'query'." });
      } catch (err) {
        res.status(400).json({
          error: (err as Error)?.message || "Could not enqueue track",
        });
      }
    });

    this.app.post("/api/queue/jump", async (req: Request, res: Response) => {
      try {
        const { queueId } = req.body as { queueId?: string };
        if (!queueId) {
          res.status(400).json({ error: "Missing queueId" });
          return;
        }
        const track = await this.music.jumpToQueueItem(queueId);
        res.json({ ok: true, track });
      } catch (err) {
        res.status(400).json({ error: (err as Error)?.message });
      }
    });

    this.app.post("/api/queue/move", (req: Request, res: Response) => {
      const { fromIndex, toIndex } = req.body as {
        fromIndex?: number;
        toIndex?: number;
      };
      if (typeof fromIndex !== "number" || typeof toIndex !== "number") {
        res.status(400).json({ error: "Invalid indices" });
        return;
      }
      const ok = this.music.moveInQueue(fromIndex, toIndex);
      res.json({ ok });
    });

    this.app.delete("/api/queue/:queueId", (req: Request, res: Response) => {
      const removed = this.music.removeFromQueue(String(req.params.queueId));
      res.json({ ok: Boolean(removed), removed });
    });

    this.app.post("/api/queue/shuffle", (_req: Request, res: Response) => {
      this.music.shuffleQueue();
      res.json({ ok: true });
    });

    this.app.post("/api/queue/clear", (_req: Request, res: Response) => {
      this.music.clearQueue();
      res.json({ ok: true });
    });

    // Player transport
    this.app.post("/api/player/toggle", async (_req: Request, res: Response) => {
      try {
        await this.music.togglePlayPause();
        res.json({ ok: true });
      } catch (err) {
        res.status(400).json({ error: (err as Error)?.message });
      }
    });

    this.app.post("/api/player/pause", async (_req: Request, res: Response) => {
      await this.music.pause();
      res.json({ ok: true });
    });

    this.app.post("/api/player/resume", async (_req: Request, res: Response) => {
      await this.music.resume();
      res.json({ ok: true });
    });

    this.app.post("/api/player/skip", async (_req: Request, res: Response) => {
      try {
        const next = await this.music.skip();
        res.json({ ok: true, next });
      } catch (err) {
        res.status(400).json({ error: (err as Error)?.message });
      }
    });

    this.app.post("/api/player/previous", async (_req: Request, res: Response) => {
      try {
        const prev = await this.music.previous();
        res.json({ ok: true, prev });
      } catch (err) {
        res.status(400).json({ error: (err as Error)?.message });
      }
    });

    this.app.post("/api/player/stop", async (_req: Request, res: Response) => {
      await this.music.stop();
      res.json({ ok: true });
    });

    this.app.post("/api/player/seek", async (req: Request, res: Response) => {
      try {
        const { positionSec } = req.body as { positionSec?: number };
        if (typeof positionSec !== "number") {
          res.status(400).json({ error: "Invalid positionSec" });
          return;
        }
        await this.music.seek(positionSec);
        res.json({ ok: true });
      } catch (err) {
        res.status(400).json({ error: (err as Error)?.message });
      }
    });

    this.app.post("/api/player/volume", async (req: Request, res: Response) => {
      const { volume } = req.body as { volume?: number };
      if (typeof volume !== "number") {
        res.status(400).json({ error: "Invalid volume" });
        return;
      }
      await this.music.setVolume(volume);
      res.json({ ok: true });
    });

    this.app.post("/api/player/mute", async (req: Request, res: Response) => {
      const { muted } = req.body as { muted?: boolean };
      await this.music.setMuted(Boolean(muted));
      res.json({ ok: true });
    });

    this.app.post("/api/player/loop", (req: Request, res: Response) => {
      const { mode } = req.body as { mode?: LoopMode };
      if (mode !== "off" && mode !== "track" && mode !== "queue") {
        res.status(400).json({ error: "Invalid loop mode" });
        return;
      }
      this.music.setLoopMode(mode);
      res.json({ ok: true });
    });

    this.app.post("/api/player/autoplay", (req: Request, res: Response) => {
      const { enabled } = req.body as { enabled?: boolean };
      this.music.setAutoplay(Boolean(enabled));
      res.json({ ok: true });
    });

    // Saved Community Playlists
    this.app.post("/api/playlists", (req: Request, res: Response) => {
      try {
        const { name, createdBy = "Web User" } = req.body as {
          name?: string;
          createdBy?: string;
        };
        if (!name || !name.trim()) {
          res.status(400).json({ error: "Playlist name is required." });
          return;
        }
        const playlist = this.music.saveCurrentAsPlaylist(name, createdBy);
        res.json({ ok: true, playlist });
      } catch (err) {
        res.status(400).json({ error: (err as Error)?.message });
      }
    });

    this.app.post("/api/playlists/:id/load", async (req: Request, res: Response) => {
      try {
        const { requestedBy = "Web User", replaceQueue = false } = req.body as {
          requestedBy?: string;
          replaceQueue?: boolean;
        };
        const count = await this.music.loadPlaylist(
          String(req.params.id),
          requestedBy,
          Boolean(replaceQueue)
        );
        res.json({ ok: true, count });
      } catch (err) {
        res.status(400).json({ error: (err as Error)?.message });
      }
    });

    this.app.delete("/api/playlists/:id", (req: Request, res: Response) => {
      const ok = this.music.deletePlaylist(String(req.params.id));
      res.json({ ok });
    });

    // Audio Output & Virtual Mic Routing
    this.app.post("/api/audio/virtual-mic/setup", async (_req: Request, res: Response) => {
      const status = await this.music.setupVirtualMicAndSelect();
      res.json({ ok: status.active, virtualMic: status });
    });

    this.app.post("/api/audio/virtual-mic/teardown", async (_req: Request, res: Response) => {
      const status = await this.music.teardownVirtualMic();
      res.json({ ok: true, virtualMic: status });
    });

    this.app.post("/api/audio/virtual-mic/monitor", async (req: Request, res: Response) => {
      const { enabled } = req.body as { enabled?: boolean };
      const status = await this.music.setLocalMonitor(Boolean(enabled));
      res.json({ ok: true, virtualMic: status });
    });

    this.app.post("/api/audio/device", async (req: Request, res: Response) => {
      try {
        const { deviceId } = req.body as { deviceId?: string };
        if (!deviceId) {
          res.status(400).json({ error: "Missing deviceId" });
          return;
        }
        await this.music.setAudioDevice(deviceId);
        res.json({ ok: true });
      } catch (err) {
        res.status(400).json({ error: (err as Error)?.message });
      }
    });

    this.app.post("/api/audio/refresh", async (_req: Request, res: Response) => {
      await this.music.refreshAudioDevices();
      res.json({ ok: true, state: this.music.getState() });
    });

    // Stream endpoint
    this.app.get("/api/stream/:sourceId", async (req: Request, res: Response) => {
      try {
        const sourceId = String(req.params.sourceId);
        const direct = await this.music.providers.ytMusic.resolveDirectAudioUrl(
          sourceId
        );
        res.redirect(direct.url);
      } catch (err) {
        res.status(500).json({ error: (err as Error)?.message });
      }
    });

    // Multi-source Lyrics endpoint (Better Lyrics Portato, LRCLIB, YouTube Music)
    this.app.get("/api/lyrics", async (req: Request, res: Response) => {
      try {
        const trackId = String(req.query.trackId || "");
        const sourceId = String(req.query.sourceId || "");
        const title = String(req.query.title || "");
        const artist = String(req.query.artist || "");
        const album = req.query.album ? String(req.query.album) : undefined;
        const durationSec = req.query.duration ? Number(req.query.duration) : undefined;

        if (!title && !sourceId) {
          res.json({ source: "None", synced: false, lines: [] });
          return;
        }

        const lyrics = await this.lyricsService.getLyrics({
          trackId,
          sourceId,
          title,
          artist,
          album,
          durationSec,
        });
        res.json(lyrics);
      } catch (err) {
        res.status(500).json({ error: (err as Error)?.message });
      }
    });
  }

  private registerStaticSpa(): void {
    if (fs.existsSync(config.publicDir)) {
      this.app.use(express.static(config.publicDir));
      this.app.get("*", (req: Request, res: Response, next) => {
        if (req.path.startsWith("/api/") || req.path === "/ws") {
          next();
          return;
        }
        const indexHtml = path.join(config.publicDir, "index.html");
        if (fs.existsSync(indexHtml)) {
          res.sendFile(indexHtml);
          return;
        }
        next();
      });
    }
  }

  public async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(config.webPort, config.webHost, () => {
        this.server.off("error", reject);
        resolve();
      });
    });
    console.log(
      `[WebUI] Collaborative Music Dashboard listening at ${config.publicWebUrl}`
    );
  }

  public async stop(): Promise<void> {
    for (const client of this.wss.clients) {
      client.terminate();
    }
    this.wss.close();
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });
  }
}
