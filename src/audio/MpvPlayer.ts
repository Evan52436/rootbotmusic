import { ChildProcess, execFileSync, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { config } from "../config";

export interface MpvPlayerEvents {
  position: (positionSec: number) => void;
  duration: (durationSec: number) => void;
  pauseChange: (paused: boolean) => void;
  trackStarted: () => void;
  trackEnded: () => void;
  trackError: (message: string) => void;
}

export class MpvPlayer extends EventEmitter {
  public readonly backend: "mpv" | "ffplay" | "none";

  private mpvProc: ChildProcess | null = null;
  private ipcSocket: net.Socket | null = null;
  private socketPath: string;
  private ipcBuffer = "";
  private requestId = 1;
  private pendingRequests = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: Error) => void }
  >();

  private volume: number = config.defaultVolume;
  private muted = false;
  private audioDevice = "auto";
  private isShuttingDown = false;
  private loadGeneration = 0;

  // Fallback ffplay state if mpv isn't installed
  private ffplayProc: ChildProcess | null = null;

  constructor() {
    super();
    this.socketPath = path.join(
      os.tmpdir(),
      `mulyo-mpv-${process.pid}.sock`
    );
    this.backend = this.detectBackend();
  }

  private detectBackend(): "mpv" | "ffplay" | "none" {
    const check = (bin: string) => {
      try {
        execFileSync(process.platform === "win32" ? "where" : "which", [bin], {
          stdio: "ignore",
        });
        return true;
      } catch {
        return false;
      }
    };
    if (check("mpv")) return "mpv";
    if (check("ffplay")) return "ffplay";
    return "none";
  }

  public async init(initialAudioDevice = "auto"): Promise<void> {
    this.audioDevice = initialAudioDevice || "auto";
    if (this.backend === "mpv") {
      await this.ensureMpvDaemon();
    }
  }

  private async ensureMpvDaemon(): Promise<void> {
    if (this.mpvProc && this.ipcSocket && !this.ipcSocket.destroyed) {
      return;
    }

    try {
      if (fs.existsSync(this.socketPath)) {
        fs.unlinkSync(this.socketPath);
      }
    } catch {
      // ignore stale socket removal error
    }

    const args = [
      "--idle=yes",
      "--no-video",
      "--no-terminal",
      "--force-window=no",
      `--input-ipc-server=${this.socketPath}`,
      `--script-opts=ytdl_hook-ytdl_path=${config.ytDlpBin}`,
      "--ytdl-format=bestaudio[acodec=opus]/bestaudio[ext=m4a]/bestaudio/best",
      "--audio-client-name=MulyoMusicBot",
      `--volume=${this.volume}`,
      `--mute=${this.muted ? "yes" : "no"}`,
      `--audio-device=${this.audioDevice}`,
    ];

    this.mpvProc = spawn("mpv", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.mpvProc.on("exit", () => {
      this.mpvProc = null;
      this.ipcSocket = null;
    });

    // Wait for Unix socket to appear
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (fs.existsSync(this.socketPath)) {
        break;
      }
      await new Promise((r) => setTimeout(r, 60));
    }

    await new Promise<void>((resolve, reject) => {
      const sock = net.createConnection(this.socketPath);
      const timer = setTimeout(() => {
        sock.destroy();
        reject(new Error("Timed out connecting to mpv IPC socket"));
      }, 4000);

      sock.once("connect", () => {
        clearTimeout(timer);
        this.ipcSocket = sock;
        this.setupSocketListeners(sock);
        resolve();
      });

      sock.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    // Subscribe to live playback telemetry
    await this.sendCommand(["observe_property", 1, "time-pos"]).catch(() => {});
    await this.sendCommand(["observe_property", 2, "duration"]).catch(() => {});
    await this.sendCommand(["observe_property", 3, "pause"]).catch(() => {});
  }

  private setupSocketListeners(sock: net.Socket): void {
    this.ipcBuffer = "";
    sock.on("data", (chunk: Buffer) => {
      this.ipcBuffer += chunk.toString("utf8");
      let nlIndex: number;
      while ((nlIndex = this.ipcBuffer.indexOf("\n")) !== -1) {
        const line = this.ipcBuffer.slice(0, nlIndex).trim();
        this.ipcBuffer = this.ipcBuffer.slice(nlIndex + 1);
        if (line) {
          this.handleIpcMessage(line);
        }
      }
    });

    sock.on("close", () => {
      for (const [, pending] of this.pendingRequests) {
        pending.reject(new Error("mpv IPC socket closed"));
      }
      this.pendingRequests.clear();
    });
  }

  private handleIpcMessage(rawLine: string): void {
    let msg: any;
    try {
      msg = JSON.parse(rawLine);
    } catch {
      return;
    }

    if (typeof msg.request_id === "number") {
      const pending = this.pendingRequests.get(msg.request_id);
      if (pending) {
        this.pendingRequests.delete(msg.request_id);
        if (msg.error && msg.error !== "success") {
          pending.reject(new Error(`mpv IPC error: ${msg.error}`));
        } else {
          pending.resolve(msg.data);
        }
      }
      return;
    }

    if (msg.event === "property-change") {
      if (msg.name === "time-pos" && typeof msg.data === "number") {
        this.emit("position", msg.data);
      } else if (msg.name === "duration" && typeof msg.data === "number") {
        this.emit("duration", msg.data);
      } else if (msg.name === "pause" && typeof msg.data === "boolean") {
        this.emit("pauseChange", msg.data);
      }
      return;
    }

    if (msg.event === "file-loaded") {
      this.emit("trackStarted");
      return;
    }

    if (msg.event === "end-file") {
      if (this.isShuttingDown) return;
      if (msg.reason === "eof") {
        this.emit("trackEnded");
      } else if (msg.reason === "error") {
        const errDetail = msg.file_error
          ? `Playback failed (${msg.file_error})`
          : "Playback failed while opening audio stream";
        this.emit("trackError", errDetail);
      }
    }
  }

  private async sendCommand(command: any[]): Promise<any> {
    await this.ensureMpvDaemon();
    const sock = this.ipcSocket;
    if (!sock || sock.destroyed) {
      throw new Error("mpv IPC socket is unavailable");
    }

    const id = this.requestId++;
    const payload = JSON.stringify({ command, request_id: id }) + "\n";

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`mpv command timed out: ${command[0]}`));
      }, 8000);

      this.pendingRequests.set(id, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      sock.write(payload);
    });
  }

  public async loadAndPlay(inputUrl: string): Promise<void> {
    this.loadGeneration++;
    const currentGen = this.loadGeneration;

    if (this.backend === "mpv") {
      await this.sendCommand(["loadfile", inputUrl, "replace"]);
      if (currentGen === this.loadGeneration) {
        await this.sendCommand(["set_property", "pause", false]).catch(
          () => {}
        );
      }
      return;
    }

    if (this.backend === "ffplay") {
      this.stopFfplay();
      const env = { ...process.env };
      if (this.audioDevice.startsWith("pulse/")) {
        env.PULSE_SINK = this.audioDevice.slice("pulse/".length);
      }
      this.ffplayProc = spawn(
        "ffplay",
        [
          "-nodisp",
          "-autoexit",
          "-loglevel",
          "quiet",
          "-volume",
          String(this.muted ? 0 : Math.min(100, this.volume)),
          inputUrl,
        ],
        { env, stdio: "ignore" }
      );
      this.emit("trackStarted");
      this.ffplayProc.on("exit", (code) => {
        if (currentGen !== this.loadGeneration || this.isShuttingDown) return;
        if (code === 0) {
          this.emit("trackEnded");
        } else {
          this.emit("trackError", `ffplay exited with code ${code}`);
        }
      });
      return;
    }

    throw new Error(
      "Neither mpv nor ffplay is installed on this host for server voice audio output."
    );
  }

  public async pause(): Promise<void> {
    if (this.backend === "mpv") {
      await this.sendCommand(["set_property", "pause", true]);
    }
  }

  public async resume(): Promise<void> {
    if (this.backend === "mpv") {
      await this.sendCommand(["set_property", "pause", false]);
    }
  }

  public async stop(): Promise<void> {
    this.loadGeneration++;
    if (this.backend === "mpv" && this.ipcSocket && !this.ipcSocket.destroyed) {
      await this.sendCommand(["stop"]).catch(() => {});
    } else if (this.backend === "ffplay") {
      this.stopFfplay();
    }
  }

  public async seek(positionSec: number): Promise<void> {
    if (this.backend === "mpv") {
      await this.sendCommand([
        "seek",
        Math.max(0, positionSec),
        "absolute",
        "exact",
      ]);
    }
  }

  public async setVolume(vol: number): Promise<void> {
    this.volume = Math.max(0, Math.min(150, Math.round(vol)));
    if (this.backend === "mpv" && this.ipcSocket && !this.ipcSocket.destroyed) {
      await this.sendCommand(["set_property", "volume", this.volume]).catch(
        () => {}
      );
    }
  }

  public async setMuted(muted: boolean): Promise<void> {
    this.muted = muted;
    if (this.backend === "mpv" && this.ipcSocket && !this.ipcSocket.destroyed) {
      await this.sendCommand(["set_property", "mute", muted]).catch(() => {});
    }
  }

  public async setAudioDevice(deviceId: string): Promise<void> {
    this.audioDevice = deviceId || "auto";
    if (this.backend === "mpv" && this.ipcSocket && !this.ipcSocket.destroyed) {
      await this.sendCommand([
        "set_property",
        "audio-device",
        this.audioDevice,
      ]);
    }
  }

  public getAudioDevice(): string {
    return this.audioDevice;
  }

  private stopFfplay(): void {
    if (this.ffplayProc) {
      this.ffplayProc.kill("SIGTERM");
      this.ffplayProc = null;
    }
  }

  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.stopFfplay();
    if (this.ipcSocket && !this.ipcSocket.destroyed) {
      try {
        this.ipcSocket.write(JSON.stringify({ command: ["quit"] }) + "\n");
      } catch {
        // ignore
      }
      this.ipcSocket.destroy();
      this.ipcSocket = null;
    }
    if (this.mpvProc) {
      this.mpvProc.kill("SIGTERM");
      this.mpvProc = null;
    }
    try {
      if (fs.existsSync(this.socketPath)) {
        fs.unlinkSync(this.socketPath);
      }
    } catch {
      // ignore
    }
  }
}
