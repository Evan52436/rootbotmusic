import React, { useEffect, useRef, useState } from "react";
import { Link2, Loader2, Music2, Play, Plus, Search, X } from "lucide-react";
import { MusicSource, SearchFilter, Track, formatTime } from "../types";

interface TopSearchBarProps {
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

function looksLikeUrl(input: string): boolean {
  const s = input.trim();
  return /^https?:\/\//i.test(s) || s.startsWith("spotify:");
}

export const TopSearchBar: React.FC<TopSearchBarProps> = ({
  onSearch,
  onAddTrack,
  onImportUrl,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const debounceTimerRef = useRef<number | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle global "/" shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        const inputEl = containerRef.current?.querySelector("input");
        inputEl?.focus();
        setIsOpen(true);
      } else if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const triggerSearch = async (val: string) => {
    const q = val.trim();
    if (!q) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    if (looksLikeUrl(q)) {
      setResults([]);
      setIsOpen(true);
      return;
    }

    setSearching(true);
    setError(null);
    setIsOpen(true);
    try {
      const items = await onSearch(q, "ytmusic", "all");
      setResults(items);
    } catch (err) {
      setError((err as Error).message);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    if (!val.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceTimerRef.current = window.setTimeout(() => {
      void triggerSearch(val);
    }, 380);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (looksLikeUrl(query)) {
      void handleImportUrl(false);
    } else {
      void triggerSearch(query);
    }
  };

  const handleImportUrl = async (playImmediately = false) => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      await onImportUrl(query.trim(), playImmediately, "ytmusic");
      setQuery("");
      setIsOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const handlePlayNow = async (track: Track) => {
    await onAddTrack(track, true);
    setIsOpen(false);
  };

  const handleQueueTrack = async (track: Track) => {
    await onAddTrack(track, false);
  };

  const isUrl = looksLikeUrl(query);

  return (
    <header className="app-top-header">
      {/* Long Search Bar Centered */}
      <div className="top-search-wrapper" ref={containerRef}>
        <form className="top-search-form" onSubmit={handleSubmit}>
          <div className="search-input-box">
            {isUrl ? (
              <Link2 size={18} className="search-lead-icon url-icon" />
            ) : (
              <Search size={18} className="search-lead-icon" />
            )}
            <input
              type="text"
              value={query}
              onChange={handleInputChange}
              onFocus={() => {
                if (query.trim()) setIsOpen(true);
              }}
              placeholder="Search songs, albums, artists, or paste any link..."
              className="top-search-input"
              aria-label="Search music or paste link"
            />
            {searching && <Loader2 size={16} className="spin search-status-icon" />}
            {query && !searching && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  setIsOpen(false);
                }}
                title="Clear"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </form>

        {/* Dropdown Results Overlay */}
        {isOpen && (
          <div className="search-results-dropdown">
            {isUrl ? (
              <div className="search-dropdown-url-prompt">
                <div className="url-prompt-desc">
                  <Link2 size={20} className="url-highlight-icon" />
                  <div>
                    <div className="url-prompt-title">Import Web Stream / Playlist</div>
                    <div className="url-prompt-subtitle">{query}</div>
                  </div>
                </div>
                <div className="url-prompt-actions">
                  <button
                    type="button"
                    className="url-action-btn primary"
                    onClick={() => void handleImportUrl(true)}
                    disabled={searching}
                  >
                    <Play size={14} />
                    <span>Play Now</span>
                  </button>
                  <button
                    type="button"
                    className="url-action-btn secondary"
                    onClick={() => void handleImportUrl(false)}
                    disabled={searching}
                  >
                    <Plus size={14} />
                    <span>Add to Queue</span>
                  </button>
                </div>
              </div>
            ) : searching && results.length === 0 ? (
              <div className="search-dropdown-loading">
                <Loader2 size={22} className="spin" />
                <span>Searching YouTube Music & audio catalogs...</span>
              </div>
            ) : error ? (
              <div className="search-dropdown-error">{error}</div>
            ) : results.length === 0 ? (
              <div className="search-dropdown-empty">
                <span>No tracks found for "{query}"</span>
              </div>
            ) : (
              <div className="search-dropdown-items-list">
                {results.map((track) => (
                  <div key={track.id} className="search-dropdown-item">
                    <img
                      src={track.thumbnailUrl}
                      alt={track.title}
                      className="search-item-thumb"
                    />
                    <div className="search-item-info">
                      <div className="search-item-title" title={track.title}>
                        {track.title}
                      </div>
                      <div className="search-item-sub">
                        {track.artist}
                        {track.album ? ` • ${track.album}` : ""}
                      </div>
                    </div>
                    <div className="search-item-duration">
                      {formatTime(track.durationSec)}
                    </div>
                    <div className="search-item-actions">
                      <button
                        type="button"
                        className="item-btn play"
                        onClick={() => void handlePlayNow(track)}
                        title="Play Now"
                      >
                        <Play size={15} fill="currentColor" />
                      </button>
                      <button
                        type="button"
                        className="item-btn queue"
                        onClick={() => void handleQueueTrack(track)}
                        title="Add to Queue"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
