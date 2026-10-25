import React, { useState } from "react";
import {
  Link2,
  Loader2,
  Music2,
  Play,
  Plus,
  Search,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import { MusicSource, SearchFilter, Track, formatTime } from "../types";

interface SearchPanelProps {
  onSearch: (
    query: string,
    source: MusicSource,
    filter: SearchFilter
  ) => Promise<Track[]>;
  onAddTrack: (track: Track, playImmediately: boolean) => Promise<void>;
  onImportUrl: (
    urlOrQuery: string,
    playImmediately: boolean,
    source: MusicSource
  ) => Promise<void>;
}

const STARTER_QUERIES = [
  "Lofi Hip Hop Beats",
  "Daft Punk Random Access Memories",
  "NIKI Every Summertime",
  "Joji Glimpse of Us",
  "Synthwave Night Drive",
];

function looksLikeUrl(input: string): boolean {
  const s = input.trim();
  return /^https?:\/\//i.test(s) || s.startsWith("spotify:");
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
  onSearch,
  onAddTrack,
  onImportUrl,
}) => {
  const [activeSource, setActiveSource] = useState<MusicSource>("ytmusic");
  const [filter, setFilter] = useState<SearchFilter>("songs");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const runSearch = async (
    customQuery?: string,
    customFilter?: SearchFilter
  ) => {
    const q = (customQuery ?? query).trim();
    if (!q || activeSource === "spotify") return;

    setSearching(true);
    setError(null);
    setHasSearched(true);
    try {
      const items = await onSearch(q, activeSource, customFilter ?? filter);
      setResults(items);
    } catch (err) {
      setError((err as Error).message);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleImportAll = async (playImmediately = false) => {
    if (!query.trim()) return;
    setImporting(true);
    try {
      await onImportUrl(query.trim(), playImmediately, activeSource);
      if (looksLikeUrl(query)) {
        setQuery("");
      }
    } finally {
      setImporting(false);
    }
  };

  const isUrl = looksLikeUrl(query);

  return (
    <section className="panel-card search-panel">
      <div className="panel-header-row">
        <div className="provider-tabs">
          <button
            type="button"
            className={`provider-tab ${
              activeSource === "ytmusic" ? "active ytmusic" : ""
            }`}
            onClick={() => setActiveSource("ytmusic")}
          >
            <Music2 size={15} />
            <span>YouTube Music</span>
          </button>

          <button
            type="button"
            className={`provider-tab ${
              activeSource === "spotify" ? "active spotify" : ""
            }`}
            onClick={() => setActiveSource("spotify")}
          >
            <Sparkles size={14} />
            <span>Spotify</span>
            <span className="phase-pill">Phase 2</span>
          </button>
        </div>

        {activeSource === "ytmusic" && (
          <div className="filter-pills">
            <button
              type="button"
              className={`filter-pill ${filter === "songs" ? "active" : ""}`}
              onClick={() => {
                setFilter("songs");
                if (query.trim()) void runSearch(query, "songs");
              }}
            >
              <Music2 size={13} />
              Songs
            </button>
            <button
              type="button"
              className={`filter-pill ${filter === "videos" ? "active" : ""}`}
              onClick={() => {
                setFilter("videos");
                if (query.trim()) void runSearch(query, "videos");
              }}
            >
              <Video size={13} />
              Videos
            </button>
          </div>
        )}
      </div>

      {activeSource === "spotify" ? (
        <div className="spotify-phase2-card">
          <div className="spotify-badge-large">Planned for Phase 2</div>
          <h3>Spotify Provider Architecture Ready</h3>
          <p>
            The backend <code>SpotifyProvider</code> and multi-source{" "}
            <code>ProviderRegistry</code> are already wired into Mulyo&apos;s
            core architecture. In Phase 2, pasting Spotify track, album, or
            playlist links (or searching the Spotify catalog) will resolve
            metadata &amp; ISRCs via the Spotify Web API and stream crisp audio
            seamlessly into your Root Voice Chat.
          </p>
          <div className="phase2-checklist">
            <span>✓ Multi-provider Track &amp; ISRC schema</span>
            <span>✓ URL router for open.spotify.com &amp; spotify: URIs</span>
            <span>✓ .env placeholders ready (SPOTIFY_CLIENT_ID / SECRET)</span>
          </div>
          <button
            type="button"
            className="primary-btn"
            onClick={() => setActiveSource("ytmusic")}
          >
            Back to YouTube Music
          </button>
        </div>
      ) : (
        <>
          <form
            className="search-bar-form"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch();
            }}
          >
            <div className="search-input-wrap">
              {isUrl ? (
                <Link2 size={18} className="search-icon url-mode" />
              ) : (
                <Search size={18} className="search-icon" />
              )}
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search YouTube Music songs, artists, or paste a song / playlist URL..."
                className="search-input"
              />
              {query && (
                <button
                  type="button"
                  className="clear-input-btn"
                  onClick={() => {
                    setQuery("");
                    setResults([]);
                    setHasSearched(false);
                    setError(null);
                  }}
                  aria-label="Clear search"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {isUrl && query.includes("list=") ? (
              <button
                type="button"
                className="primary-btn"
                disabled={importing}
                onClick={() => void handleImportAll(false)}
              >
                {importing ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <Plus size={16} />
                )}
                <span>Import Playlist</span>
              </button>
            ) : (
              <button
                type="submit"
                className="primary-btn"
                disabled={searching || !query.trim()}
              >
                {searching ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <Search size={16} />
                )}
                <span>{isUrl ? "Resolve URL" : "Search"}</span>
              </button>
            )}
          </form>

          {!hasSearched && results.length === 0 && (
            <div className="starter-chips-area">
              <span className="starter-label">Try quick search:</span>
              <div className="starter-chips">
                {STARTER_QUERIES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="starter-chip"
                    onClick={() => {
                      setQuery(q);
                      void runSearch(q);
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <div className="search-error">{error}</div>}

          <div className="search-results-list">
            {searching ? (
              <div className="empty-state-box">
                <Loader2 size={26} className="spin accent" />
                <p>Searching YouTube Music catalog...</p>
              </div>
            ) : results.length > 0 ? (
              results.map((track) => (
                <div key={track.id} className="track-row">
                  <div className="track-thumb-wrap">
                    <img
                      src={track.thumbnailUrl}
                      alt={track.title}
                      className="track-thumb"
                      loading="lazy"
                    />
                    <button
                      type="button"
                      className="thumb-play-overlay"
                      onClick={() => void onAddTrack(track, true)}
                      title="Play immediately"
                    >
                      <Play size={16} />
                    </button>
                  </div>

                  <div className="track-info">
                    <div className="track-title" title={track.title}>
                      {track.title}
                    </div>
                    <div className="track-sub">
                      <span>{track.artist}</span>
                      {track.album && (
                        <>
                          <span className="dot">•</span>
                          <span className="album-name">{track.album}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <span className="track-duration">
                    {track.durationSec > 0 ? formatTime(track.durationSec) : "—"}
                  </span>

                  <div className="track-actions">
                    <button
                      type="button"
                      className="action-btn secondary"
                      onClick={() => void onAddTrack(track, false)}
                      title="Add to Queue"
                    >
                      <Plus size={15} />
                      <span>Queue</span>
                    </button>
                    <button
                      type="button"
                      className="action-btn primary"
                      onClick={() => void onAddTrack(track, true)}
                      title="Play Now"
                    >
                      <Play size={14} />
                      <span>Play</span>
                    </button>
                  </div>
                </div>
              ))
            ) : hasSearched && !error ? (
              <div className="empty-state-box">
                <p>No tracks matched &ldquo;{query}&rdquo;. Try another search!</p>
              </div>
            ) : (
              <div className="empty-state-box subtle">
                <Music2 size={28} />
                <p>
                  Search millions of songs from YouTube Music or paste any link
                  to queue into Root Voice Chat.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
};
