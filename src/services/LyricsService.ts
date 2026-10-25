import { YouTubeMusicProvider } from "../providers/YouTubeMusicProvider";

export interface LyricLine {
  time?: number; // timestamp in seconds if synced
  text: string;
  secondaryText?: string;
}

export interface LyricsResponse {
  source: string;
  synced: boolean;
  lines: LyricLine[];
}

export class LyricsService {
  private cache = new Map<string, LyricsResponse>();

  constructor(private ytProvider: YouTubeMusicProvider) {}

  public async getLyrics(params: {
    trackId: string;
    sourceId: string;
    title: string;
    artist: string;
    album?: string;
    durationSec?: number;
  }): Promise<LyricsResponse> {
    const cleanTitle = this.sanitizeTitle(params.title);
    const cleanArtist = this.sanitizeArtist(params.artist);
    const cacheKey =
      params.trackId ||
      params.sourceId ||
      `${cleanTitle.toLowerCase()}:${cleanArtist.toLowerCase()}`;

    if (cacheKey && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // 1. Try Better Lyrics (Portato / TTML)
    try {
      const blResult = await this.fetchFromBetterLyrics(
        cleanTitle,
        cleanArtist,
        params.album,
        params.durationSec
      );
      if (blResult && blResult.lines.length > 0) {
        this.cache.set(cacheKey, blResult);
        return blResult;
      }
    } catch (e) {
      // Better Lyrics failed, fallback
    }

    // 2. Try LRCLIB (Synced LRC or plain text)
    try {
      const lrclibResult = await this.fetchFromLrclib(
        cleanTitle,
        cleanArtist,
        params.album,
        params.durationSec
      );
      if (lrclibResult && lrclibResult.lines.length > 0) {
        this.cache.set(cacheKey, lrclibResult);
        return lrclibResult;
      }
    } catch (e) {
      // LRCLIB failed, fallback
    }

    // 3. Fallback to YouTube Music official lyrics (Static/Unsynced)
    try {
      const ytmResult = await this.fetchFromYouTubeMusic(params.sourceId);
      if (ytmResult && ytmResult.lines.length > 0) {
        this.cache.set(cacheKey, ytmResult);
        return ytmResult;
      }
    } catch (e) {
      // YTM failed
    }

    const empty: LyricsResponse = {
      source: "None",
      synced: false,
      lines: [{ text: "No lyrics available for this track." }],
    };
    this.cache.set(cacheKey, empty);
    return empty;
  }

  private sanitizeTitle(title: string): string {
    return title
      .replace(/\s*[\(\[](official\s*(music\s*)?video|audio|lyrics?|visualizer|mv|hd|hq)[\)\]]/gi, "")
      .replace(/\s*-\s*(official\s*(music\s*)?video|audio|lyrics?|visualizer)$/gi, "")
      .replace(/\s*\(feat\.?[^\)]*\)/gi, "")
      .replace(/\s*\[feat\.?[^\]]*\]/gi, "")
      .trim();
  }

  private sanitizeArtist(artist: string): string {
    return artist
      .replace(/\s*-\s*Topic$/i, "")
      .replace(/,\s*.*$/, "") // Primary artist
      .trim();
  }

  private async fetchFromBetterLyrics(
    song: string,
    artist: string,
    album?: string,
    duration?: number
  ): Promise<LyricsResponse | null> {
    const url = new URL("https://api.betterlyrics.org/getLyrics");
    url.searchParams.set("s", song);
    url.searchParams.set("a", artist);
    if (album) url.searchParams.set("al", album);
    if (duration) url.searchParams.set("d", String(Math.round(duration)));

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "MulyoMusicBot/1.0 (https://github.com/mulyo-music)",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.ttml) return null;

    const lines = this.parseTtml(data.ttml);
    if (lines.length === 0) return null;

    return {
      source: "Better Lyrics (Portato)",
      synced: true,
      lines,
    };
  }

  private parseTtml(ttml: string): LyricLine[] {
    const lines: LyricLine[] = [];
    const pRegex = /<p\b[^>]*begin="([^"]+)"[^>]*>(.*?)<\/p>/g;
    let match;
    while ((match = pRegex.exec(ttml)) !== null) {
      const beginStr = match[1];
      let time = 0;
      if (beginStr.includes(":")) {
        const parts = beginStr.split(":").map(Number);
        if (parts.length === 2) time = parts[0] * 60 + parts[1];
        if (parts.length === 3) time = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else {
        time = parseFloat(beginStr.replace("s", ""));
      }
      const text = match[2].replace(/<[^>]+>/g, "").trim();
      if (text) {
        lines.push({ time, text });
      }
    }
    return lines;
  }

  private async fetchFromLrclib(
    title: string,
    artist: string,
    album?: string,
    duration?: number
  ): Promise<LyricsResponse | null> {
    // 1. Search to find the best match with syncedLyrics
    try {
      const sUrl = new URL("https://lrclib.net/api/search");
      sUrl.searchParams.set("q", `${artist} ${title}`);
      const sRes = await fetch(sUrl.toString(), {
        headers: {
          "User-Agent": "MulyoMusicBot/1.0 (https://github.com/mulyo-music)",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (sRes.ok) {
        const sData = await sRes.json();
        if (Array.isArray(sData) && sData.length > 0) {
          // Always prioritize the entry with synchronized lyrics!
          const matchWithSync = sData.find((x: any) => Boolean(x.syncedLyrics));
          if (matchWithSync) {
            const lines = this.parseLrc(matchWithSync.syncedLyrics);
            if (lines.length > 0) {
              return {
                source: "LRCLIB",
                synced: true,
                lines,
              };
            }
          }

          // If no synced, use plain lyrics
          if (sData[0].plainLyrics) {
            const lines = sData[0].plainLyrics
              .split(/\r?\n/)
              .map((l: string) => l.trim())
              .filter(Boolean)
              .map((text: string, idx: number, arr: string[]) => {
                const estTime = duration
                  ? (idx / arr.length) * duration
                  : idx * 5;
                return { time: estTime, text };
              });
            if (lines.length > 0) {
              return {
                source: "LRCLIB",
                synced: true,
                lines,
              };
            }
          }
        }
      }
    } catch {}

    // 2. Direct get fallback
    try {
      const url = new URL("https://lrclib.net/api/get");
      url.searchParams.set("track_name", title);
      url.searchParams.set("artist_name", artist);
      if (album) url.searchParams.set("album_name", album);
      if (duration) url.searchParams.set("duration", String(Math.round(duration)));

      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent": "MulyoMusicBot/1.0 (https://github.com/mulyo-music)",
        },
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.syncedLyrics) {
          const lines = this.parseLrc(data.syncedLyrics);
          if (lines.length > 0) {
            return {
              source: "LRCLIB",
              synced: true,
              lines,
            };
          }
        }
        if (data.plainLyrics) {
          const lines = data.plainLyrics
            .split(/\r?\n/)
            .map((l: string) => l.trim())
            .filter(Boolean)
            .map((text: string, idx: number, arr: string[]) => ({
              time: duration ? (idx / arr.length) * duration : idx * 5,
              text,
            }));
          if (lines.length > 0) {
            return {
              source: "LRCLIB",
              synced: true,
              lines,
            };
          }
        }
      }
    } catch {}

    return null;
  }

  private parseLrc(lrc: string): LyricLine[] {
    const lines: LyricLine[] = [];
    const regex = /\[(\d+):(\d+(?:\.\d+)?)\](.*)/;
    for (const raw of lrc.split(/\r?\n/)) {
      const m = raw.match(regex);
      if (m) {
        const min = parseInt(m[1], 10);
        const sec = parseFloat(m[2]);
        const text = m[3].trim();
        if (text) {
          lines.push({ time: min * 60 + sec, text });
        }
      }
    }
    return lines;
  }

  private async fetchFromYouTubeMusic(sourceId: string): Promise<LyricsResponse | null> {
    try {
      const yt: any = await (this.ytProvider as any).getInnertube();
      const lyricsObj = await yt.music.getLyrics(sourceId);
      const text: string | undefined = lyricsObj?.description?.text;
      if (!text) return null;

      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l, idx, arr) => ({
          time: (idx / Math.max(1, arr.length)) * 180,
          text: l,
        }));

      return {
        source: "YouTube Music",
        synced: true,
        lines,
      };
    } catch {
      return null;
    }
  }
}
