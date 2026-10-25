import React, { useEffect, useRef, useState } from "react";
import {
  Disc3,
  ListMusic,
  Loader2,
  MoreVertical,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
} from "lucide-react";
import { LoopMode, PlayerState, formatTime } from "../types";
import { API_BASE } from "../hooks/useMusicStudio";

interface NowPlayingStageProps {
  state: PlayerState | null;
  livePosition: number;
  onTogglePlay: () => void;
  onSkip: () => void;
  onPrevious: () => void;
  onSeek: (sec: number) => void;
  onVolume: (vol: number) => void;
  onMute: (muted: boolean) => void;
  onCycleLoop: (next: LoopMode) => void;
  onToggleShuffle: () => void;
  onOpenSearch: () => void;
  onOpenQueue: () => void;
}

export const NowPlayingStage: React.FC<NowPlayingStageProps> = ({
  state,
  livePosition,
  onTogglePlay,
  onSkip,
  onPrevious,
  onSeek,
  onVolume,
  onMute,
  onCycleLoop,
  onToggleShuffle,
  onOpenSearch,
  onOpenQueue,
}) => {
  const [scrubValue, setScrubValue] = useState<number | null>(null);
  const [browserAudioMuted, setBrowserAudioMuted] = useState(false);
  const [showVolumePopup, setShowVolumePopup] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  const track = state?.currentTrack ?? null;
  const duration = state?.durationSec || track?.durationSec || 0;
  const displayPos = scrubValue !== null ? scrubValue : livePosition;
  const remainingSec = Math.max(0, duration - displayPos);

  const progressPct =
    duration > 0 ? Math.min(100, Math.max(0, (displayPos / duration) * 100)) : 0;

  const isPlaying = state?.status === "playing";
  const isLoading = state?.status === "loading";

  const nextLoopMode = (): LoopMode => {
    const cur = state?.loopMode || "off";
    if (cur === "off") return "queue";
    if (cur === "queue") return "track";
    return "off";
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Global keyboard shortcuts for ultimate music player feel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        onTogglePlay();
      } else if (e.key === "ArrowRight" || e.key === "n") {
        onSkip();
      } else if (e.key === "ArrowLeft" || e.key === "p") {
        onPrevious();
      } else if (e.key === "/" || e.key === "s") {
        e.preventDefault();
        onOpenSearch();
      } else if (e.key === "q") {
        e.preventDefault();
        onOpenQueue();
      } else if (e.key === "m") {
        setBrowserAudioMuted((v) => !v);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onTogglePlay, onSkip, onPrevious, onOpenSearch, onOpenQueue]);

  // Browser Audio playback engine: synchronizes with live server position
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    if (!track) {
      el.pause();
      el.removeAttribute("src");
      el.load();
      return;
    }

    const streamUrl = `${API_BASE}/api/stream/${encodeURIComponent(track.sourceId)}`;

    if (el.dataset.trackId !== track.id) {
      el.dataset.trackId = track.id;
      el.src = streamUrl;
      el.preload = "auto";

      const onMetadata = () => {
        if (livePosition > 1) {
          el.currentTime = livePosition;
        }
        if (isPlaying) {
          el.play().catch(() => {
            // If browser blocks autoplay, unlock on the first user interaction
            const unlock = () => {
              el.play().catch(() => {});
            };
            window.addEventListener("pointerdown", unlock, { once: true });
            window.addEventListener("keydown", unlock, { once: true });
          });
        }
      };

      el.addEventListener("loadedmetadata", onMetadata, { once: true });
      el.load();
    } else {
      // If same track, only correct if drift is significant (> 2.5s) to avoid micro-stutters
      if (el.readyState >= 2 && Math.abs(el.currentTime - livePosition) > 2.5) {
        el.currentTime = livePosition;
      }
    }
  }, [track?.id, livePosition]);

  // Handle play / pause transitions without interrupting stream buffering
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !track) return;

    if (isPlaying) {
      if (el.paused) {
        el.play().catch(() => {
          const unlock = () => {
            el.play().catch(() => {});
          };
          window.addEventListener("pointerdown", unlock, { once: true });
          window.addEventListener("keydown", unlock, { once: true });
        });
      }
    } else {
      if (!el.paused) {
        el.pause();
      }
    }
  }, [isPlaying, track?.id]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1, Math.max(0, (state?.volume ?? 75) / 100));
      audioRef.current.muted = Boolean(state?.muted) || browserAudioMuted;
    }
  }, [state?.volume, state?.muted, browserAudioMuted]);

  const handleLike = () => {
    setLiked((v) => !v);
    if (!liked) setDisliked(false);
  };

  const handleDislike = () => {
    setDisliked((v) => !v);
    if (!disliked) {
      setLiked(false);
      onSkip(); // Skip to next track on dislike, like modern music players
    }
  };

  return (
    <div className="player-stage-left">
      <audio ref={audioRef} preload="none" />

      {/* Album Artwork */}
      <div className="artwork-display-card">
        {track ? (
          <img
            src={track.thumbnailUrl}
            alt={track.title}
            className="artwork-image"
          />
        ) : (
          <div className="artwork-placeholder-box">
            <Disc3 size={84} className="placeholder-disc" />
            <button
              type="button"
              className="quick-search-trigger-btn"
              onClick={onOpenSearch}
            >
              <Search size={16} />
              <span>Search a Song</span>
            </button>
          </div>
        )}
      </div>

      {/* Song Details Row */}
      <div className="song-details-block">
        <div className="song-title-row">
          <h1 className="song-title-text" title={track?.title || "No Track Playing"}>
            {track ? track.title : "No Track Playing"}
          </h1>

          <div className="song-title-actions" ref={moreMenuRef}>
            {/* Volume Icon Button */}
            <button
              type="button"
              className={`action-icon-btn ${browserAudioMuted ? "muted" : ""}`}
              onClick={() => setShowVolumePopup((v) => !v)}
              title={browserAudioMuted ? "Unmute local audio" : "Volume Control"}
            >
              {browserAudioMuted || (state?.volume ?? 0) === 0 ? (
                <VolumeX size={19} />
              ) : (
                <Volume2 size={19} />
              )}
            </button>

            {/* More Vertical (3-dots) Menu Button */}
            <button
              type="button"
              className="action-icon-btn"
              onClick={() => setShowMoreMenu((v) => !v)}
              title="More Options (Search, Queue, Loop)"
            >
              <MoreVertical size={19} />
            </button>

            {/* Volume Slider Popup */}
            {showVolumePopup && (
              <div className="volume-popup-card">
                <input
                  type="range"
                  min={0}
                  max={150}
                  value={state?.volume ?? 75}
                  onChange={(e) => onVolume(Number(e.target.value))}
                  className="popup-volume-slider"
                />
                <button
                  type="button"
                  className="popup-mute-btn"
                  onClick={() => setBrowserAudioMuted((v) => !v)}
                >
                  {browserAudioMuted ? "Unmute" : "Mute"}
                </button>
              </div>
            )}

            {/* 3-dots Context Menu */}
            {showMoreMenu && (
              <div className="more-options-menu-card">
                <button
                  type="button"
                  className="menu-item-btn"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onOpenSearch();
                  }}
                >
                  <Search size={16} />
                  <span>Search Songs & Add</span>
                  <span className="kbd-shortcut">/</span>
                </button>

                <button
                  type="button"
                  className="menu-item-btn"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onOpenQueue();
                  }}
                >
                  <ListMusic size={16} />
                  <span>Up Next Queue</span>
                  {Boolean(state?.queue?.length) && (
                    <span className="menu-badge">{state?.queue?.length}</span>
                  )}
                  <span className="kbd-shortcut">Q</span>
                </button>

                <div className="menu-divider" />

                <button
                  type="button"
                  className="menu-item-btn"
                  onClick={() => onCycleLoop(nextLoopMode())}
                >
                  {state?.loopMode === "track" ? (
                    <Repeat1 size={16} className="active-icon" />
                  ) : (
                    <Repeat
                      size={16}
                      className={state?.loopMode === "queue" ? "active-icon" : ""}
                    />
                  )}
                  <span>
                    Loop:{" "}
                    {state?.loopMode === "track"
                      ? "Track"
                      : state?.loopMode === "queue"
                        ? "Queue"
                        : "Off"}
                  </span>
                </button>

                <button
                  type="button"
                  className="menu-item-btn"
                  onClick={() => onToggleShuffle()}
                >
                  <Shuffle size={16} />
                  <span>Shuffle Queue</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="song-artist-row">
          <span className="artist-text">
            {track ? (
              <>
                {track.artist}
                {track.album ? ` • ${track.album}` : ""}
              </>
            ) : (
              "Queue a song to begin"
            )}
          </span>
        </div>
      </div>

      {/* Scrubber Timeline */}
      <div className="scrubber-section">
        <div className="scrubber-track-container">
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 100}
            step={0.5}
            disabled={!track || duration <= 0}
            value={duration > 0 ? displayPos : 0}
            onChange={(e) => setScrubValue(Number(e.target.value))}
            onMouseUp={() => {
              if (scrubValue !== null) {
                onSeek(scrubValue);
                setScrubValue(null);
              }
            }}
            onTouchEnd={() => {
              if (scrubValue !== null) {
                onSeek(scrubValue);
                setScrubValue(null);
              }
            }}
            style={
              {
                "--progress": `${progressPct}%`,
              } as React.CSSProperties
            }
            className="sleek-scrubber-slider"
            aria-label="Seek timeline"
          />
        </div>

        <div className="scrubber-timestamps">
          <span className="timestamp-text">{formatTime(displayPos)}</span>
          <span className="timestamp-text">
            {duration > 0 ? `-${formatTime(remainingSec)}` : "0:00"}
          </span>
        </div>
      </div>

      {/* Control Buttons Below Details Matching Screenshot */}
      <div className="under-song-controls">
        {/* Thumbs Up (Like) on far left */}
        <button
          type="button"
          className={`control-secondary-btn ${liked ? "active-thumb-up" : ""}`}
          onClick={handleLike}
          title={liked ? "Liked" : "Like"}
        >
          <ThumbsUp
            size={20}
            fill={liked ? "#ffffff" : "none"}
            color={liked ? "#ffffff" : "currentColor"}
          />
        </button>

        {/* Center: Previous, Play/Pause Circle, Next */}
        <div className="control-center-cluster">
          <button
            type="button"
            className="control-nav-btn"
            onClick={onPrevious}
            disabled={!track}
            title="Previous (P / Left)"
          >
            <SkipBack size={22} fill="currentColor" />
          </button>

          <button
            type="button"
            className="control-play-circle-btn"
            onClick={onTogglePlay}
            disabled={!track && !state?.queue?.length}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isLoading ? (
              <Loader2 size={24} className="spin" color="#000000" />
            ) : isPlaying ? (
              <Pause size={24} fill="#000000" color="#000000" />
            ) : (
              <Play size={24} fill="#000000" color="#000000" style={{ marginLeft: 3 }} />
            )}
          </button>

          <button
            type="button"
            className="control-nav-btn"
            onClick={onSkip}
            disabled={!track && !state?.queue?.length}
            title="Next Track (N / Right)"
          >
            <SkipForward size={22} fill="currentColor" />
          </button>
        </div>

        {/* Thumbs Down (Dislike / Skip) on far right */}
        <button
          type="button"
          className={`control-secondary-btn ${disliked ? "active-thumb-down" : ""}`}
          onClick={handleDislike}
          title={disliked ? "Disliked" : "Dislike & Skip"}
        >
          <ThumbsDown
            size={20}
            fill={disliked ? "#ffffff" : "none"}
            color={disliked ? "#ffffff" : "currentColor"}
          />
        </button>
      </div>
    </div>
  );
};
