export type MusicSource = "ytmusic" | "spotify";
export type LoopMode = "off" | "track" | "queue";
export type SearchFilter = "songs" | "videos" | "all";
export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "error";

export interface Track {
  id: string;
  source: MusicSource;
  sourceId: string;
  title: string;
  artist: string;
  album?: string;
  durationSec: number;
  thumbnailUrl: string;
  externalUrl: string;
  isrc?: string;
}

export interface QueueItem extends Track {
  queueId: string;
  requestedBy: string;
  requestedVia: "web" | "root-chat";
  addedAt: number;
}

export interface SavedPlaylist {
  id: string;
  name: string;
  createdBy: string;
  createdAt: number;
  tracks: Track[];
}

export interface AudioDeviceInfo {
  id: string;
  name: string;
  driver: string;
  isVirtualMicSink: boolean;
}

export interface VirtualMicStatus {
  supported: boolean;
  backend: "pipewire-pulse" | "unsupported";
  active: boolean;
  sinkName: string;
  mpvDeviceId: string;
  micSourceName: string;
  micDescription: string;
  monitorLoopbackActive: boolean;
  error?: string;
}

export interface RootBotStatus {
  connected: boolean;
  mode: "root-devhost" | "standalone";
  prefix: string;
  communityName?: string;
  botAppId?: string;
  voiceParticipantsCount: number;
  lastCommandAt?: number;
  error?: string;
}

export interface ProviderStatusInfo {
  source: MusicSource;
  displayName: string;
  enabled: boolean;
  phase: 1 | 2;
  description: string;
}

export interface PlayerState {
  status: PlaybackStatus;
  currentTrack: QueueItem | null;
  positionSec: number;
  durationSec: number;
  volume: number;
  muted: boolean;
  loopMode: LoopMode;
  autoplay: boolean;
  audioDevice: string;
  audioBackend: "mpv" | "ffplay" | "none";
  queue: QueueItem[];
  history: QueueItem[];
  playlists: SavedPlaylist[];
  virtualMic: VirtualMicStatus;
  audioDevices: AudioDeviceInfo[];
  rootBot: RootBotStatus;
  providers: ProviderStatusInfo[];
  webUrl: string;
  lastError: string | null;
  updatedAt: number;
}

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
