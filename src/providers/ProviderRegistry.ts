import {
  IMusicProvider,
  MusicSource,
  ProviderStatusInfo,
  SearchFilter,
  Track,
} from "../types/music";
import { YouTubeMusicProvider } from "./YouTubeMusicProvider";
import { SpotifyProvider } from "./SpotifyProvider";

export class ProviderRegistry {
  public readonly ytMusic: YouTubeMusicProvider;
  public readonly spotify: SpotifyProvider;
  private readonly providers: Map<MusicSource, IMusicProvider>;

  constructor() {
    this.ytMusic = new YouTubeMusicProvider();
    this.spotify = new SpotifyProvider();
    this.providers = new Map<MusicSource, IMusicProvider>([
      ["ytmusic", this.ytMusic],
      ["spotify", this.spotify],
    ]);
  }

  public getProvider(source: MusicSource): IMusicProvider {
    const provider = this.providers.get(source);
    if (!provider) {
      throw new Error(`Unknown music provider: ${source}`);
    }
    return provider;
  }

  public getStatusList(): ProviderStatusInfo[] {
    return [
      {
        source: "ytmusic",
        displayName: "YouTube Music",
        enabled: this.ytMusic.isEnabled(),
        phase: 1,
        description:
          "Primary music catalog — songs, official videos, playlists, and radio autoplay.",
      },
      {
        source: "spotify",
        displayName: "Spotify",
        enabled: this.spotify.isEnabled(),
        phase: 2,
        description:
          "Phase 2 roadmap — Spotify track, album, and playlist metadata + YT Music audio bridge.",
      },
    ];
  }

  public detectUrlProvider(input: string): IMusicProvider | null {
    for (const provider of this.providers.values()) {
      if (provider.canHandleUrl(input)) {
        return provider;
      }
    }
    return null;
  }

  public async search(
    query: string,
    source: MusicSource = "ytmusic",
    filter: SearchFilter = "songs",
    limit = 15
  ): Promise<Track[]> {
    const urlProvider = this.detectUrlProvider(query);
    if (urlProvider) {
      const resolved = await urlProvider.resolveUrl(query);
      return resolved.tracks.slice(0, limit);
    }

    const provider = this.getProvider(source);
    if (!provider.isEnabled()) {
      throw new Error(
        `${provider.displayName} is not enabled yet (Phase ${provider.phase}).`
      );
    }
    return provider.search(query, filter, limit);
  }

  public async resolveQueryOrUrl(
    input: string,
    preferredSource: MusicSource = "ytmusic"
  ): Promise<{ isPlaylist: boolean; title?: string; tracks: Track[] }> {
    const trimmed = input.trim();
    const urlProvider = this.detectUrlProvider(trimmed);
    if (urlProvider) {
      const res = await urlProvider.resolveUrl(trimmed);
      return {
        isPlaylist: res.tracks.length > 1 || Boolean(res.title),
        title: res.title,
        tracks: res.tracks,
      };
    }

    const results = await this.search(trimmed, preferredSource, "songs", 1);
    return {
      isPlaylist: false,
      tracks: results.length > 0 ? [results[0]] : [],
    };
  }
}
