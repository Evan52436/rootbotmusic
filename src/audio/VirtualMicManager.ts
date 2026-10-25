import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AudioDeviceInfo, VirtualMicStatus } from "../types/music";

const execFileAsync = promisify(execFile);

export const VIRTUAL_SINK_NAME = "mulyo_music_sink";
export const VIRTUAL_MIC_NAME = "mulyo_music_mic";
export const VIRTUAL_MIC_DESC = "Mulyo_Music_Bot_Mic";

export class VirtualMicManager {
  private sinkModuleId: number | null = null;
  private remapModuleId: number | null = null;
  private loopbackModuleId: number | null = null;
  private pactlAvailable: boolean | null = null;
  private lastError: string | undefined;

  public async isSupported(): Promise<boolean> {
    if (this.pactlAvailable !== null) return this.pactlAvailable;
    if (process.platform !== "linux") {
      this.pactlAvailable = false;
      return false;
    }
    try {
      await execFileAsync("pactl", ["info"], { timeout: 4000 });
      this.pactlAvailable = true;
      return true;
    } catch {
      this.pactlAvailable = false;
      return false;
    }
  }

  private async hasSink(name: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync("pactl", ["list", "short", "sinks"], {
        timeout: 4000,
      });
      return stdout
        .split(/\r?\n/)
        .some((line) => line.split(/\t/)[1]?.trim() === name);
    } catch {
      return false;
    }
  }

  private async hasSource(name: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(
        "pactl",
        ["list", "short", "sources"],
        { timeout: 4000 }
      );
      return stdout
        .split(/\r?\n/)
        .some((line) => line.split(/\t/)[1]?.trim() === name);
    } catch {
      return false;
    }
  }

  private async findLoopbackModuleId(): Promise<number | null> {
    try {
      const { stdout } = await execFileAsync(
        "pactl",
        ["list", "short", "modules"],
        { timeout: 4000 }
      );
      for (const line of stdout.split(/\r?\n/)) {
        if (
          line.includes("module-loopback") &&
          line.includes(`${VIRTUAL_SINK_NAME}.monitor`)
        ) {
          const id = parseInt(line.split(/\t/)[0], 10);
          if (!Number.isNaN(id)) return id;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  public async setupVirtualMic(): Promise<VirtualMicStatus> {
    this.lastError = undefined;
    const supported = await this.isSupported();
    if (!supported) {
      this.lastError =
        "Automatic Virtual Mic setup requires Linux PipeWire/PulseAudio (pactl). On Windows/macOS, select VB-Cable or BlackHole in Audio Output Devices.";
      return this.getStatus();
    }

    try {
      if (!(await this.hasSink(VIRTUAL_SINK_NAME))) {
        const { stdout } = await execFileAsync(
          "pactl",
          [
            "load-module",
            "module-null-sink",
            `sink_name=${VIRTUAL_SINK_NAME}`,
            `sink_properties=device.description=Mulyo_Music_Bot_Output`,
          ],
          { timeout: 5000 }
        );
        const id = parseInt(stdout.trim(), 10);
        if (!Number.isNaN(id)) this.sinkModuleId = id;
      }

      if (!(await this.hasSource(VIRTUAL_MIC_NAME))) {
        const { stdout } = await execFileAsync(
          "pactl",
          [
            "load-module",
            "module-remap-source",
            `master=${VIRTUAL_SINK_NAME}.monitor`,
            `source_name=${VIRTUAL_MIC_NAME}`,
            `source_properties=device.description=${VIRTUAL_MIC_DESC}`,
          ],
          { timeout: 5000 }
        );
        const id = parseInt(stdout.trim(), 10);
        if (!Number.isNaN(id)) this.remapModuleId = id;
      }
    } catch (err) {
      this.lastError = (err as Error)?.message || String(err);
    }

    return this.getStatus();
  }

  public async teardownVirtualMic(): Promise<VirtualMicStatus> {
    this.lastError = undefined;
    if (!(await this.isSupported())) return this.getStatus();

    try {
      await this.setLocalMonitor(false);

      const { stdout } = await execFileAsync(
        "pactl",
        ["list", "short", "modules"],
        { timeout: 4000 }
      );
      const lines = stdout.split(/\r?\n/);

      // Unload remap-source first, then null-sink
      for (const line of lines) {
        if (
          line.includes("module-remap-source") &&
          line.includes(`source_name=${VIRTUAL_MIC_NAME}`)
        ) {
          const id = line.split(/\t/)[0]?.trim();
          if (id) {
            await execFileAsync("pactl", ["unload-module", id]).catch(() => {});
          }
        }
      }
      for (const line of lines) {
        if (
          line.includes("module-null-sink") &&
          line.includes(`sink_name=${VIRTUAL_SINK_NAME}`)
        ) {
          const id = line.split(/\t/)[0]?.trim();
          if (id) {
            await execFileAsync("pactl", ["unload-module", id]).catch(() => {});
          }
        }
      }
      this.sinkModuleId = null;
      this.remapModuleId = null;
    } catch (err) {
      this.lastError = (err as Error)?.message || String(err);
    }

    return this.getStatus();
  }

  public async setLocalMonitor(enable: boolean): Promise<VirtualMicStatus> {
    if (!(await this.isSupported())) return this.getStatus();

    try {
      const existingId =
        this.loopbackModuleId ?? (await this.findLoopbackModuleId());
      if (enable && !existingId) {
        const { stdout } = await execFileAsync(
          "pactl",
          [
            "load-module",
            "module-loopback",
            `source=${VIRTUAL_SINK_NAME}.monitor`,
            "latency_msec=40",
          ],
          { timeout: 5000 }
        );
        const id = parseInt(stdout.trim(), 10);
        if (!Number.isNaN(id)) this.loopbackModuleId = id;
      } else if (!enable && existingId) {
        await execFileAsync("pactl", ["unload-module", String(existingId)], {
          timeout: 5000,
        }).catch(() => {});
        this.loopbackModuleId = null;
      }
    } catch (err) {
      this.lastError = (err as Error)?.message || String(err);
    }

    return this.getStatus();
  }

  public async getStatus(): Promise<VirtualMicStatus> {
    const supported = await this.isSupported();
    if (!supported) {
      return {
        supported: false,
        backend: "unsupported",
        active: false,
        sinkName: VIRTUAL_SINK_NAME,
        mpvDeviceId: "auto",
        micSourceName: VIRTUAL_MIC_NAME,
        micDescription: "Mulyo Music Bot Mic",
        monitorLoopbackActive: false,
        error: this.lastError,
      };
    }

    const sinkExists = await this.hasSink(VIRTUAL_SINK_NAME);
    const micExists = await this.hasSource(VIRTUAL_MIC_NAME);
    const loopbackId = await this.findLoopbackModuleId();

    return {
      supported: true,
      backend: "pipewire-pulse",
      active: sinkExists && micExists,
      sinkName: VIRTUAL_SINK_NAME,
      mpvDeviceId: `pulse/${VIRTUAL_SINK_NAME}`,
      micSourceName: VIRTUAL_MIC_NAME,
      micDescription: "Mulyo Music Bot Mic",
      monitorLoopbackActive: loopbackId !== null,
      error: this.lastError,
    };
  }

  public async listAudioDevices(): Promise<AudioDeviceInfo[]> {
    const devices: AudioDeviceInfo[] = [
      {
        id: "auto",
        name: "System Default Speaker / Output",
        driver: "auto",
        isVirtualMicSink: false,
      },
    ];

    try {
      const { stdout } = await execFileAsync("mpv", ["--audio-device=help"], {
        timeout: 5000,
      });
      const seenNames = new Set<string>();

      for (const rawLine of stdout.split(/\r?\n/)) {
        const match = rawLine.match(/^\s*'([^']+)'\s*\((.+)\)\s*$/);
        if (!match) continue;
        const [, id, rawDesc] = match;
        if (id === "auto") continue;

        const driver = id.includes("/") ? id.split("/")[0] : id;
        // Prefer pulse/* on Linux PipeWire/PulseAudio, plus coreaudio/wasapi on macOS/Windows
        if (
          driver !== "pulse" &&
          driver !== "coreaudio" &&
          driver !== "wasapi" &&
          !(driver === "pipewire" && !id.includes("/"))
        ) {
          continue;
        }
        if (id === "pipewire") continue;

        const isVirtualMicSink = id.includes(VIRTUAL_SINK_NAME);
        const friendlyName = isVirtualMicSink
          ? "Mulyo Virtual Mic -> Root Voice Chat (Recommended)"
          : rawDesc;

        const dedupeKey = `${driver}:${rawDesc}`;
        if (seenNames.has(dedupeKey)) continue;
        seenNames.add(dedupeKey);

        devices.push({
          id,
          name: friendlyName,
          driver,
          isVirtualMicSink,
        });
      }
    } catch {
      // mpv not installed or no audio subsystem; keep 'auto'
    }

    // Put Virtual Mic sink right at the top when active!
    devices.sort((a, b) => {
      if (a.isVirtualMicSink && !b.isVirtualMicSink) return -1;
      if (!a.isVirtualMicSink && b.isVirtualMicSink) return 1;
      return 0;
    });

    return devices;
  }
}
