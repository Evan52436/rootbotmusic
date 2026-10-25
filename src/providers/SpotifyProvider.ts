import { config } from "../config";
import {
  IMusicProvider,
  SearchFilter,
  StreamSource,
  Track,
} from "../types/music";

/**
 * Phase 2 Provider Scaffold: Spotify Integration
 *
 * Designed so Phase 2 can plug in Spotify Web API metadata resolution
 * (tracks, albums, playlists + ISRC) and bridge audio playback through
 * YouTubeMusicProvider without changing Queue, Bot, or Web UI contracts.
 */
export class SpotifyProvider implements IMusicProvider {
  public readonly source = "spotify" as const;
  public readonly displayName = "Spotify";
  public readonly phase = 2 as const;

  public isEnabled(): boolean {
    return (
      config.spotify.enabled &&
      Boolean(config.spotify.clientId) &&
      Boolean(config.spotify.clientSecret)
    );
  }

  public canHandleUrl(input: string): boolean {
    const trimmed = input.trim();
    if (trimmed.startsWith("spotify:")) return true;
    try {
      const u = new URL(trimmed);
      return u.hostname.replace(/^www\./, "").toLowerCase() === "open.spotify.com";
    } catch {
      return false;
    }
  }

  public async search(
    _query: string,
    _filter?: SearchFilter,
    _limit?: number
  ): Promise<Track[]> {
    throw new Error(
      "Spotify support is planned for Phase 2. Please search with YouTube Music for now!"
    );
  }

  public async resolveUrl(
    _url: string
  ): Promise<{ title?: string; tracks: Track[] }> {
    throw new Error(
      "Spotify URL import is planned for Phase 2. Please use a YouTube Music URL or search by song title!"
    );
  }

  public async getStreamSource(_track: Track): Promise<StreamSource> {
    throw new Error("Spotify playback bridge is planned for Phase 2.");
  }
}
