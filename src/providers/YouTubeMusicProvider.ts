import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Innertube } from "youtubei.js";
import { config } from "../config";
import {
  IMusicProvider,
  SearchFilter,
  StreamSource,
  Track,
} from "../types/music";

const execFileAsync = promisify(execFile);

export class YouTubeMusicProvider implements IMusicProvider {
  public readonly source = "ytmusic" as const;
  public readonly displayName = "YouTube Music";
  public readonly phase = 1 as const;

  private innertubePromise: Promise<Innertube> | null = null;

  public isEnabled(): boolean {
    return true;
  }

  private getInnertube(): Promise<Innertube> {
    if (!this.innertubePromise) {
      this.innertubePromise = Innertube.create({
        retrieve_player: false,
        generate_session_locally: true,
      }).catch((err) => {
        this.innertubePromise = null;
        throw err;
      });
    }
    return this.innertubePromise;
  }

  public canHandleUrl(input: string): boolean {
    try {
      const u = new URL(input.trim());
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      return (
        host === "music.youtube.com" ||
        host === "youtube.com" ||
        host === "m.youtube.com" ||
        host === "youtu.be"
      );
    } catch {
      return false;
    }
  }

  public async search(
    query: string,
    filter: SearchFilter = "songs",
    limit = 15
  ): Promise<Track[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    if (this.canHandleUrl(trimmed)) {
      const resolved = await this.resolveUrl(trimmed);
      return resolved.tracks.slice(0, limit);
    }

    try {
      const yt = await this.getInnertube();
      const ytType =
        filter === "videos" ? "video" : filter === "songs" ? "song" : "all";
      const searchRes = await yt.music.search(trimmed, {
        type: ytType as "song" | "video" | "all",
      });

      const tracks: Track[] = [];
      const shelves: any[] = (searchRes as any)?.contents || [];

      for (const shelf of shelves) {
        const items: any[] = shelf?.contents || [];
        for (const item of items) {
          const parsed = this.parseMusicItem(item);
          if (parsed && !tracks.some((t) => t.sourceId === parsed.sourceId)) {
            tracks.push(parsed);
            if (tracks.length >= limit) break;
          }
        }
        if (tracks.length >= limit) break;
      }

      if (tracks.length > 0) {
        return tracks;
      }
    } catch (err) {
      console.warn(
        "[YouTubeMusicProvider] Innertube search warning, falling back to yt-dlp:",
        (err as Error)?.message || err
      );
    }

    return this.searchViaYtDlp(trimmed, limit);
  }

  private parseMusicItem(item: any): Track | null {
    const videoId: string | undefined =
      item?.id ||
      item?.video_id ||
      item?.endpoint?.payload?.videoId ||
      item?.overlay?.content?.endpoint?.payload?.videoId;

    if (!videoId || typeof videoId !== "string") {
      return null;
    }

    const title: string =
      item?.title?.toString?.() ||
      item?.name?.toString?.() ||
      item?.flex_columns?.[0]?.title?.toString?.() ||
      "Unknown Title";

    let artist = "";
    if (Array.isArray(item?.artists) && item.artists.length > 0) {
      artist = item.artists
        .map((a: any) => a?.name?.toString?.() || "")
        .filter(Boolean)
        .join(", ");
    } else if (Array.isArray(item?.authors) && item.authors.length > 0) {
      artist = item.authors
        .map((a: any) => a?.name?.toString?.() || "")
        .filter(Boolean)
        .join(", ");
    } else if (item?.author?.name) {
      artist = String(item.author.name);
    } else if (item?.flex_columns?.[1]?.title) {
      const subtitle = item.flex_columns[1].title.toString();
      // Typically "Song • Artist • Album • 3:42" or "Artist • Album"
      const parts = subtitle
        .split("•")
        .map((s: string) => s.trim())
        .filter(Boolean);
      if (parts.length >= 2 && /^(song|video)$/i.test(parts[0])) {
        artist = parts[1];
      } else if (parts.length >= 1) {
        artist = parts[0];
      }
    }
    if (!artist) artist = "Unknown Artist";

    const album: string | undefined =
      item?.album?.name?.toString?.() || undefined;

    let durationSec = 0;
    if (typeof item?.duration?.seconds === "number") {
      durationSec = item.duration.seconds;
    } else if (typeof item?.duration === "number") {
      durationSec = item.duration;
    } else if (typeof item?.duration?.text === "string") {
      durationSec = this.parseDurationText(item.duration.text);
    } else if (item?.flex_columns?.[1]?.title) {
      const subtitle = item.flex_columns[1].title.toString();
      const parts = subtitle.split("•").map((s: string) => s.trim());
      const last = parts[parts.length - 1];
      if (last && /^\d+:\d{2}(:\d{2})?$/.test(last)) {
        durationSec = this.parseDurationText(last);
      }
    }

    const thumbs: any[] =
      item?.thumbnails || item?.thumbnail?.contents || item?.thumbnail || [];
    let thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    if (Array.isArray(thumbs) && thumbs.length > 0) {
      const best = thumbs[thumbs.length - 1]?.url || thumbs[0]?.url;
      if (typeof best === "string" && best.startsWith("http")) {
        thumbnailUrl = best.replace(/=w\d+-h\d+[^&]*/, "=w544-h544");
      }
    }

    return {
      id: `ytmusic:${videoId}`,
      source: "ytmusic",
      sourceId: videoId,
      title: title.trim(),
      artist: artist.trim(),
      album,
      durationSec,
      thumbnailUrl,
      externalUrl: `https://music.youtube.com/watch?v=${videoId}`,
    };
  }

  private parseDurationText(text: string): number {
    const parts = text
      .trim()
      .split(":")
      .map((n) => parseInt(n, 10));
    if (parts.some((n) => Number.isNaN(n))) return 0;
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return parts[0] || 0;
  }

  private async searchViaYtDlp(query: string, limit: number): Promise<Track[]> {
    const { stdout } = await execFileAsync(
      config.ytDlpBin,
      [
        `ytsearch${limit}:${query}`,
        "--dump-json",
        "--flat-playlist",
        "--no-warnings",
      ],
      { maxBuffer: 8 * 1024 * 1024, timeout: 25000 }
    );

    const tracks: Track[] = [];
    for (const line of stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        if (!data?.id) continue;
        tracks.push(this.mapYtDlpEntryToTrack(data));
      } catch {
        // skip malformed line
      }
    }
    return tracks;
  }

  public async resolveUrl(
    url: string
  ): Promise<{ title?: string; tracks: Track[] }> {
    const parsed = new URL(url.trim());
    const isExplicitPlaylistPath = parsed.pathname.includes("/playlist");
    const videoId =
      parsed.hostname === "youtu.be"
        ? parsed.pathname.slice(1).split("/")[0]
        : parsed.searchParams.get("v");

    const args = ["--dump-single-json", "--flat-playlist", "--no-warnings"];

    let targetUrl = url.trim();
    if (videoId && !isExplicitPlaylistPath) {
      // Single track URL (ignore auto-generated radio mix ?list=RDAMVM... unless it's /playlist)
      targetUrl = `https://music.youtube.com/watch?v=${videoId}`;
      args.push("--no-playlist");
    } else {
      args.push("--playlist-end", "100");
    }
    args.push(targetUrl);

    const { stdout } = await execFileAsync(config.ytDlpBin, args, {
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30000,
    });

    const payload = JSON.parse(stdout);
    if (Array.isArray(payload?.entries)) {
      const tracks = payload.entries
        .filter((e: any) => e && e.id)
        .map((e: any) => this.mapYtDlpEntryToTrack(e));
      return {
        title: payload.title || "YouTube Music Playlist",
        tracks,
      };
    }

    if (payload?.id) {
      return {
        tracks: [this.mapYtDlpEntryToTrack(payload)],
      };
    }

    return { tracks: [] };
  }

  private mapYtDlpEntryToTrack(entry: any): Track {
    const videoId = String(entry.id);
    const thumbs: any[] = Array.isArray(entry.thumbnails)
      ? entry.thumbnails
      : [];
    const bestThumb =
      entry.thumbnail ||
      (thumbs.length > 0 ? thumbs[thumbs.length - 1]?.url : null) ||
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    const artist =
      entry.artist ||
      entry.creator ||
      entry.channel ||
      entry.uploader ||
      "Unknown Artist";

    return {
      id: `ytmusic:${videoId}`,
      source: "ytmusic",
      sourceId: videoId,
      title: String(entry.track || entry.title || "Unknown Title"),
      artist: String(artist).replace(/ - Topic$/i, ""),
      album: entry.album ? String(entry.album) : undefined,
      durationSec: Math.round(Number(entry.duration || 0)),
      thumbnailUrl: String(bestThumb),
      externalUrl: `https://music.youtube.com/watch?v=${videoId}`,
    };
  }

  public async getStreamSource(track: Track): Promise<StreamSource> {
    return {
      inputUrl: `https://www.youtube.com/watch?v=${track.sourceId}`,
    };
  }

  public async resolveDirectAudioUrl(
    sourceId: string
  ): Promise<{ url: string; mimeType: string }> {
    const { stdout } = await execFileAsync(
      config.ytDlpBin,
      [
        "-f",
        "bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio",
        "--no-playlist",
        "--no-warnings",
        "--print",
        "%(url)s\n%(ext)s",
        `https://www.youtube.com/watch?v=${sourceId}`,
      ],
      { timeout: 20000 }
    );
    const [url, ext] = stdout.trim().split(/\r?\n/);
    if (!url || !url.startsWith("http")) {
      throw new Error("Failed to extract direct audio URL from YouTube Music");
    }
    const mimeType =
      ext === "m4a" ? "audio/mp4" : ext === "webm" ? "audio/webm" : "audio/mpeg";
    return { url, mimeType };
  }

  public async getRelatedTracks(track: Track, limit = 5): Promise<Track[]> {
    try {
      const yt = await this.getInnertube();
      const upNext: any = await yt.music.getUpNext(track.sourceId, true);
      const contents: any[] = upNext?.contents || [];
      const results: Track[] = [];

      for (const item of contents) {
        const videoId = item?.video_id || item?.id;
        if (!videoId || videoId === track.sourceId) continue;

        const parsed = this.parseMusicItem(item);
        if (parsed) {
          results.push(parsed);
          if (results.length >= limit) break;
        }
      }
      return results;
    } catch {
      return [];
    }
  }
}
