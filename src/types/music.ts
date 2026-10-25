export type MusicSource = "ytmusic" | "spotify";

export type LoopMode = "off" | "track" | "queue";

export type SearchFilter = "songs" | "videos" | "all";

export interface Track {
  /** Globally unique key `${source}:${sourceId}` */
  id: string;
  source: MusicSource;
  sourceId: string;
  title: string;
  artist: string;
  album?: string;
  durationSec: number;
  thumbnailUrl: string;
  externalUrl: string;
  /** Optional ISRC for cross-provider resolution in Phase 2 (Spotify -> YT Music audio) */
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

export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "error";

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

export interface StreamSource {
  /** Direct media URL or YouTube watch URL handled by mpv + yt-dlp */
  inputUrl: string;
  /** Optional direct HTTP audio stream URL for browser preview */
  directAudioUrl?: string;
  mimeType?: string;
}

export interface IMusicProvider {
  readonly source: MusicSource;
  readonly displayName: string;
  readonly phase: 1 | 2;
  isEnabled(): boolean;
  canHandleUrl(url: string): boolean;
  search(query: string, filter?: SearchFilter, limit?: number): Promise<Track[]>;
  resolveUrl(url: string): Promise<{ title?: string; tracks: Track[] }>;
  getStreamSource(track: Track): Promise<StreamSource>;
  getRelatedTracks?(track: Track, limit?: number): Promise<Track[]>;
}
