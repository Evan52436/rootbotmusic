import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { MpvPlayer } from "../audio/MpvPlayer";
import { VirtualMicManager } from "../audio/VirtualMicManager";
import { config } from "../config";
import { ProviderRegistry } from "../providers/ProviderRegistry";
import {
  AudioDeviceInfo,
  LoopMode,
  MusicSource,
  PlaybackStatus,
  PlayerState,
  QueueItem,
  RootBotStatus,
  SavedPlaylist,
  SearchFilter,
  Track,
  VirtualMicStatus,
} from "../types/music";

interface PersistedData {
  volume?: number;
  loopMode?: LoopMode;
  autoplay?: boolean;
  preferredAudioDevice?: string;
  playlists?: SavedPlaylist[];
}

export class MusicController extends EventEmitter {
  public readonly providers: ProviderRegistry;
  public readonly player: MpvPlayer;
  public readonly virtualMic: VirtualMicManager;

  private status: PlaybackStatus = "idle";
  private currentTrack: QueueItem | null = null;
  private positionSec = 0;
  private durationSec = 0;
  private volume: number = config.defaultVolume;
  private muted = false;
  private loopMode: LoopMode = "off";
  private autoplay = false;
  private queue: QueueItem[] = [];
  private history: QueueItem[] = [];
  private playlists: SavedPlaylist[] = [];
  private lastError: string | null = null;

  private virtualMicStatus: VirtualMicStatus = {
    supported: false,
    backend: "unsupported",
    active: false,
    sinkName: "mulyo_music_sink",
    mpvDeviceId: "auto",
    micSourceName: "mulyo_music_mic",
    micDescription: "Mulyo Music Bot Mic",
    monitorLoopbackActive: false,
  };
  private audioDevices: AudioDeviceInfo[] = [];

  private rootBotStatus: RootBotStatus = {
    connected: false,
    mode: config.isStandalone ? "standalone" : "root-devhost",
    prefix: config.botPrefix,
    voiceParticipantsCount: 0,
  };

  private readonly stateFilePath: string;
  private preferredAudioDevice = "";
  private lastProgressEmitMs = 0;
  private lastPositionEventMs = 0;

  constructor() {
    super();
    this.providers = new ProviderRegistry();
    this.player = new MpvPlayer();
    this.virtualMic = new VirtualMicManager();
    this.stateFilePath = path.join(config.dataDir, "library.json");
    this.loadPersistedData();
    this.bindPlayerEvents();
  }

  private loadPersistedData(): void {
    try {
      if (!fs.existsSync(this.stateFilePath)) return;
      const raw = JSON.parse(
        fs.readFileSync(this.stateFilePath, "utf8")
      ) as PersistedData;
      if (typeof raw.volume === "number") {
        this.volume = Math.max(0, Math.min(150, raw.volume));
      }
      if (
        raw.loopMode === "off" ||
        raw.loopMode === "track" ||
        raw.loopMode === "queue"
      ) {
        this.loopMode = raw.loopMode;
      }
      if (typeof raw.autoplay === "boolean") {
        this.autoplay = raw.autoplay;
      }
      if (typeof raw.preferredAudioDevice === "string") {
        this.preferredAudioDevice = raw.preferredAudioDevice;
      }
      if (Array.isArray(raw.playlists)) {
        this.playlists = raw.playlists;
      }
    } catch (err) {
      console.warn("[MusicController] Could not read persisted library.json:", err);
    }
  }

  private savePersistedData(): void {
    try {
      fs.mkdirSync(config.dataDir, { recursive: true });
      const data: PersistedData = {
        volume: this.volume,
        loopMode: this.loopMode,
        autoplay: this.autoplay,
        preferredAudioDevice: this.player.getAudioDevice(),
        playlists: this.playlists,
      };
      fs.writeFileSync(this.stateFilePath, JSON.stringify(data, null, 2), "utf8");
    } catch (err) {
      console.warn("[MusicController] Could not save library.json:", err);
    }
  }

  private bindPlayerEvents(): void {
    this.player.on("position", (pos: number) => {
      this.positionSec = pos;
      this.lastPositionEventMs = Date.now();
      const now = Date.now();
      if (now - this.lastProgressEmitMs >= 250) {
        this.lastProgressEmitMs = now;
        this.emit("progress", {
          positionSec: this.positionSec,
          durationSec: this.durationSec,
          status: this.status,
        });
      }
    });

    // Heartbeat clock: ensures the room timeline advances seamlessly even if hardware audio driver has jitter
    setInterval(() => {
      if (this.status === "playing" && this.currentTrack) {
        const now = Date.now();
        if (now - this.lastPositionEventMs > 1000) {
          this.positionSec = Math.min(
            this.durationSec || Infinity,
            Math.round((this.positionSec + 0.25) * 100) / 100
          );
          this.emit("progress", {
            positionSec: this.positionSec,
            durationSec: this.durationSec,
            status: this.status,
          });
          if (
            this.durationSec > 0 &&
            this.positionSec >= this.durationSec - 0.25
          ) {
            void this.handleTrackFinished();
          }
        }
      }
    }, 250);

    this.player.on("duration", (dur: number) => {
      if (dur > 0 && Math.abs(dur - this.durationSec) > 0.5) {
        this.durationSec = Math.round(dur);
        if (this.currentTrack && !this.currentTrack.durationSec) {
          this.currentTrack.durationSec = this.durationSec;
        }
        this.broadcastState();
      }
    });

    this.player.on("pauseChange", (paused: boolean) => {
      if (!this.currentTrack) return;
      const nextStatus: PlaybackStatus = paused ? "paused" : "playing";
      if (this.status !== nextStatus && this.status !== "loading") {
        this.status = nextStatus;
        this.broadcastState();
      }
    });

    this.player.on("trackStarted", () => {
      if (this.currentTrack) {
        this.status = "playing";
        this.lastError = null;
        this.broadcastState();
        this.emit("trackStarted", this.currentTrack);
      }
    });

    this.player.on("trackEnded", () => {
      void this.handleTrackFinished();
    });

    this.player.on("trackError", (message: string) => {
      console.error("[MusicController] Track error:", message);
      this.lastError = message;
      this.status = "error";
      this.broadcastState();
      // Auto-advance if there are more items in queue
      if (this.queue.length > 0) {
        setTimeout(() => {
          void this.skip();
        }, 1200);
      }
    });
  }

  public async init(): Promise<void> {
    if (config.autoCreateVirtualMic) {
      this.virtualMicStatus = await this.virtualMic.setupVirtualMic();
    } else {
      this.virtualMicStatus = await this.virtualMic.getStatus();
    }

    this.audioDevices = await this.virtualMic.listAudioDevices();

    let targetDevice =
      config.explicitAudioDevice || this.preferredAudioDevice || "";
    if (!targetDevice) {
      targetDevice = this.virtualMicStatus.active
        ? this.virtualMicStatus.mpvDeviceId
        : "auto";
    }
    // Verify preferred device actually exists in detected devices
    if (
      targetDevice !== "auto" &&
      !this.audioDevices.some((d) => d.id === targetDevice)
    ) {
      targetDevice = this.virtualMicStatus.active
        ? this.virtualMicStatus.mpvDeviceId
        : "auto";
    }

    await this.player.setVolume(this.volume);
    await this.player.init(targetDevice);
    this.broadcastState();
  }

  public getState(): PlayerState {
    return {
      status: this.status,
      currentTrack: this.currentTrack,
      positionSec: this.positionSec,
      durationSec: this.durationSec,
      volume: this.volume,
      muted: this.muted,
      loopMode: this.loopMode,
      autoplay: this.autoplay,
      audioDevice: this.player.getAudioDevice(),
      audioBackend: this.player.backend,
      queue: [...this.queue],
      history: [...this.history],
      playlists: [...this.playlists],
      virtualMic: { ...this.virtualMicStatus },
      audioDevices: [...this.audioDevices],
      rootBot: { ...this.rootBotStatus },
      providers: this.providers.getStatusList(),
      webUrl: config.publicWebUrl,
      lastError: this.lastError,
      updatedAt: Date.now(),
    };
  }

  private broadcastState(): void {
    this.emit("state", this.getState());
  }

  public updateRootBotStatus(patch: Partial<RootBotStatus>): void {
    this.rootBotStatus = { ...this.rootBotStatus, ...patch };
    this.broadcastState();
  }

  public async search(
    query: string,
    source: MusicSource = "ytmusic",
    filter: SearchFilter = "songs",
    limit = 15
  ): Promise<Track[]> {
    return this.providers.search(query, source, filter, limit);
  }

  private toQueueItem(
    track: Track,
    requestedBy: string,
    requestedVia: "web" | "root-chat"
  ): QueueItem {
    return {
      ...track,
      queueId: crypto.randomUUID(),
      requestedBy: requestedBy.trim() || "Member",
      requestedVia,
      addedAt: Date.now(),
    };
  }

  public async enqueueTracks(
    tracks: Track[],
    options: {
      requestedBy: string;
      requestedVia: "web" | "root-chat";
      playImmediately?: boolean;
    }
  ): Promise<{ startedNow: QueueItem | null; added: QueueItem[] }> {
    if (tracks.length === 0) {
      return { startedNow: null, added: [] };
    }

    const items = tracks.map((t) =>
      this.toQueueItem(t, options.requestedBy, options.requestedVia)
    );

    if (options.playImmediately) {
      const [first, ...rest] = items;
      if (this.currentTrack) {
        this.pushHistory(this.currentTrack);
      }
      if (rest.length > 0) {
        this.queue.unshift(...rest);
      }
      await this.startQueueItem(first);
      return { startedNow: first, added: items };
    }

    this.queue.push(...items);

    if (!this.currentTrack || this.status === "idle" || this.status === "error") {
      const next = this.queue.shift()!;
      await this.startQueueItem(next);
      return { startedNow: next, added: items };
    }

    this.broadcastState();
    return { startedNow: null, added: items };
  }

  public async playQueryOrUrl(
    input: string,
    options: {
      requestedBy: string;
      requestedVia: "web" | "root-chat";
      playImmediately?: boolean;
      preferredSource?: MusicSource;
    }
  ): Promise<{
    isPlaylist: boolean;
    playlistTitle?: string;
    startedNow: QueueItem | null;
    added: QueueItem[];
  }> {
    const resolved = await this.providers.resolveQueryOrUrl(
      input,
      options.preferredSource || "ytmusic"
    );
    if (resolved.tracks.length === 0) {
      throw new Error(`No songs found matching "${input}".`);
    }
    const res = await this.enqueueTracks(resolved.tracks, {
      requestedBy: options.requestedBy,
      requestedVia: options.requestedVia,
      playImmediately: options.playImmediately,
    });
    return {
      isPlaylist: resolved.isPlaylist,
      playlistTitle: resolved.title,
      ...res,
    };
  }

  private async startQueueItem(item: QueueItem): Promise<void> {
    this.currentTrack = item;
    this.positionSec = 0;
    this.durationSec = item.durationSec || 0;
    this.status = "loading";
    this.lastError = null;
    this.broadcastState();

    try {
      const provider = this.providers.getProvider(item.source);
      const stream = await provider.getStreamSource(item);
      await this.player.loadAndPlay(stream.inputUrl);
    } catch (err) {
      const msg = (err as Error)?.message || String(err);
      this.lastError = msg;
      this.status = "error";
      this.broadcastState();
      throw err;
    }
  }

  private pushHistory(item: QueueItem): void {
    this.history = [
      item,
      ...this.history.filter((h) => h.queueId !== item.queueId),
    ].slice(0, 30);
  }

  private async handleTrackFinished(): Promise<void> {
    const finished = this.currentTrack;
    if (!finished) return;

    if (this.loopMode === "track") {
      await this.startQueueItem({
        ...finished,
        queueId: crypto.randomUUID(),
      });
      return;
    }

    this.pushHistory(finished);

    if (this.loopMode === "queue") {
      this.queue.push({
        ...finished,
        queueId: crypto.randomUUID(),
        addedAt: Date.now(),
      });
    }

    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      await this.startQueueItem(next);
      return;
    }

    if (this.autoplay && finished.source === "ytmusic") {
      try {
        const related = await this.providers.ytMusic.getRelatedTracks(
          finished,
          6
        );
        const recentIds = new Set(this.history.slice(0, 10).map((h) => h.id));
        const candidate =
          related.find((r) => !recentIds.has(r.id)) || related[0];
        if (candidate) {
          const autoItem = this.toQueueItem(candidate, "Autoplay Radio", "web");
          await this.startQueueItem(autoItem);
          return;
        }
      } catch (err) {
        console.warn("[MusicController] Autoplay lookup failed:", err);
      }
    }

    this.currentTrack = null;
    this.positionSec = 0;
    this.durationSec = 0;
    this.status = "idle";
    this.broadcastState();
  }

  public async pause(): Promise<void> {
    if (!this.currentTrack) return;
    await this.player.pause();
    this.status = "paused";
    this.broadcastState();
  }

  public async resume(): Promise<void> {
    if (!this.currentTrack) {
      if (this.queue.length > 0) {
        const next = this.queue.shift()!;
        await this.startQueueItem(next);
      }
      return;
    }
    await this.player.resume();
    this.status = "playing";
    this.broadcastState();
  }

  public async togglePlayPause(): Promise<void> {
    if (this.status === "playing") {
      await this.pause();
    } else {
      await this.resume();
    }
  }

  public async skip(): Promise<QueueItem | null> {
    if (this.currentTrack) {
      this.pushHistory(this.currentTrack);
      if (this.loopMode === "queue") {
        this.queue.push({
          ...this.currentTrack,
          queueId: crypto.randomUUID(),
          addedAt: Date.now(),
        });
      }
    }

    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      await this.startQueueItem(next);
      return next;
    }

    await this.player.stop();
    this.currentTrack = null;
    this.positionSec = 0;
    this.durationSec = 0;
    this.status = "idle";
    this.broadcastState();
    return null;
  }

  public async previous(): Promise<QueueItem | null> {
    if (this.currentTrack && this.positionSec > 5) {
      await this.seek(0);
      return this.currentTrack;
    }

    const prev = this.history.shift();
    if (!prev) {
      if (this.currentTrack) {
        await this.seek(0);
      }
      return this.currentTrack;
    }

    if (this.currentTrack) {
      this.queue.unshift(this.currentTrack);
    }
    await this.startQueueItem(prev);
    return prev;
  }

  public async stop(): Promise<void> {
    if (this.currentTrack) {
      this.pushHistory(this.currentTrack);
    }
    this.currentTrack = null;
    this.positionSec = 0;
    this.durationSec = 0;
    this.status = "idle";
    await this.player.stop();
    this.broadcastState();
  }

  public async seek(positionSec: number): Promise<void> {
    if (!this.currentTrack) return;
    const clamped = Math.max(
      0,
      this.durationSec > 0 ? Math.min(this.durationSec, positionSec) : positionSec
    );
    await this.player.seek(clamped);
    this.positionSec = clamped;
    this.broadcastState();
  }

  public async setVolume(volume: number): Promise<void> {
    this.volume = Math.max(0, Math.min(150, Math.round(volume)));
    await this.player.setVolume(this.volume);
    if (this.volume > 0 && this.muted) {
      this.muted = false;
      await this.player.setMuted(false);
    }
    this.savePersistedData();
    this.broadcastState();
  }

  public async setMuted(muted: boolean): Promise<void> {
    this.muted = muted;
    await this.player.setMuted(muted);
    this.broadcastState();
  }

  public setLoopMode(mode: LoopMode): void {
    this.loopMode = mode;
    this.savePersistedData();
    this.broadcastState();
  }

  public setAutoplay(enabled: boolean): void {
    this.autoplay = enabled;
    this.savePersistedData();
    this.broadcastState();
  }

  public shuffleQueue(): void {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.broadcastState();
  }

  public clearQueue(): void {
    this.queue = [];
    this.broadcastState();
  }

  public removeFromQueue(queueIdOrIndex: string | number): QueueItem | null {
    let idx = -1;
    if (typeof queueIdOrIndex === "number") {
      idx = queueIdOrIndex;
    } else {
      idx = this.queue.findIndex((q) => q.queueId === queueIdOrIndex);
    }
    if (idx < 0 || idx >= this.queue.length) return null;
    const [removed] = this.queue.splice(idx, 1);
    this.broadcastState();
    return removed;
  }

  public moveInQueue(fromIndex: number, toIndex: number): boolean {
    if (
      fromIndex < 0 ||
      fromIndex >= this.queue.length ||
      toIndex < 0 ||
      toIndex >= this.queue.length ||
      fromIndex === toIndex
    ) {
      return false;
    }
    const [item] = this.queue.splice(fromIndex, 1);
    this.queue.splice(toIndex, 0, item);
    this.broadcastState();
    return true;
  }

  public async jumpToQueueItem(queueId: string): Promise<QueueItem | null> {
    const idx = this.queue.findIndex((q) => q.queueId === queueId);
    if (idx === -1) return null;
    const [target] = this.queue.splice(idx, 1);
    if (this.currentTrack) {
      this.pushHistory(this.currentTrack);
    }
    await this.startQueueItem(target);
    return target;
  }

  // Playlists
  public saveCurrentAsPlaylist(name: string, createdBy: string): SavedPlaylist {
    const tracks: Track[] = [];
    if (this.currentTrack) tracks.push(this.stripQueueMeta(this.currentTrack));
    for (const q of this.queue) tracks.push(this.stripQueueMeta(q));
    if (tracks.length === 0) {
      throw new Error("Nothing in Now Playing or Queue to save.");
    }
    const playlist: SavedPlaylist = {
      id: crypto.randomUUID(),
      name: name.trim() || "Untitled Mix",
      createdBy: createdBy.trim() || "Member",
      createdAt: Date.now(),
      tracks,
    };
    this.playlists.unshift(playlist);
    this.savePersistedData();
    this.broadcastState();
    return playlist;
  }

  public async loadPlaylist(
    playlistId: string,
    requestedBy: string,
    replaceQueue = false
  ): Promise<number> {
    const pl = this.playlists.find((p) => p.id === playlistId);
    if (!pl) throw new Error("Playlist not found.");
    if (replaceQueue) {
      this.queue = [];
    }
    const res = await this.enqueueTracks(pl.tracks, {
      requestedBy,
      requestedVia: "web",
      playImmediately: replaceQueue,
    });
    return res.added.length;
  }

  public deletePlaylist(playlistId: string): boolean {
    const before = this.playlists.length;
    this.playlists = this.playlists.filter((p) => p.id !== playlistId);
    if (this.playlists.length !== before) {
      this.savePersistedData();
      this.broadcastState();
      return true;
    }
    return false;
  }

  private stripQueueMeta(item: QueueItem): Track {
    return {
      id: item.id,
      source: item.source,
      sourceId: item.sourceId,
      title: item.title,
      artist: item.artist,
      album: item.album,
      durationSec: item.durationSec,
      thumbnailUrl: item.thumbnailUrl,
      externalUrl: item.externalUrl,
      isrc: item.isrc,
    };
  }

  // Audio Routing & Virtual Mic Controls
  public async refreshAudioDevices(): Promise<void> {
    this.virtualMicStatus = await this.virtualMic.getStatus();
    this.audioDevices = await this.virtualMic.listAudioDevices();
    this.broadcastState();
  }

  public async setupVirtualMicAndSelect(): Promise<VirtualMicStatus> {
    this.virtualMicStatus = await this.virtualMic.setupVirtualMic();
    this.audioDevices = await this.virtualMic.listAudioDevices();
    if (this.virtualMicStatus.active) {
      await this.player.setAudioDevice(this.virtualMicStatus.mpvDeviceId);
      this.savePersistedData();
    }
    this.broadcastState();
    return this.virtualMicStatus;
  }

  public async teardownVirtualMic(): Promise<VirtualMicStatus> {
    if (this.player.getAudioDevice() === this.virtualMicStatus.mpvDeviceId) {
      await this.player.setAudioDevice("auto");
    }
    this.virtualMicStatus = await this.virtualMic.teardownVirtualMic();
    this.audioDevices = await this.virtualMic.listAudioDevices();
    this.savePersistedData();
    this.broadcastState();
    return this.virtualMicStatus;
  }

  public async setLocalMonitor(enable: boolean): Promise<VirtualMicStatus> {
    this.virtualMicStatus = await this.virtualMic.setLocalMonitor(enable);
    this.broadcastState();
    return this.virtualMicStatus;
  }

  public async setAudioDevice(deviceId: string): Promise<void> {
    await this.player.setAudioDevice(deviceId);
    this.savePersistedData();
    this.broadcastState();
  }

  public async shutdown(): Promise<void> {
    await this.player.shutdown();
  }
}
