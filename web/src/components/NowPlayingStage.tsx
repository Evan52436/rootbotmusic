import React, { useEffect, useRef, useState } from "react";
import {
  Disc3,
  ExternalLink,
  Headphones,
  Loader2,
  Mic,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { LoopMode, PlayerState, formatTime } from "../types";

interface NowPlayingStageProps {
  state: PlayerState | null;
  livePosition: number;
  onTogglePlay: () => void;
  onSkip: () => void;
  onPrevious: () => void;
  onStop: () => void;
  onSeek: (sec: number) => void;
  onVolume: (vol: number) => void;
  onMute: (muted: boolean) => void;
  onCycleLoop: (next: LoopMode) => void;
  onToggleAutoplay: (enabled: boolean) => void;
  onShuffleQueue: () => void;
  onOpenAudioModal: () => void;
}

export const NowPlayingStage: React.FC<NowPlayingStageProps> = ({
  state,
  livePosition,
  onTogglePlay,
  onSkip,
  onPrevious,
  onStop,
  onSeek,
  onVolume,
  onMute,
  onCycleLoop,
  onToggleAutoplay,
  onShuffleQueue,
  onOpenAudioModal,
}) => {
  const [scrubValue, setScrubValue] = useState<number | null>(null);
  const [browserAudioMuted, setBrowserAudioMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const track = state?.currentTrack ?? null;
  const duration = state?.durationSec || track?.durationSec || 0;
  const displayPos = scrubValue !== null ? scrubValue : livePosition;
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

  // Browser Audio is the primary output: synchronizes automatically for everyone!
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!track) {
      el.pause();
      el.removeAttribute("src");
      return;
    }
    const streamUrl = `/api/stream/${encodeURIComponent(track.sourceId)}`;
    if (el.dataset.trackId !== track.id) {
      el.dataset.trackId = track.id;
      el.src = streamUrl;
      if (livePosition > 1) {
        el.currentTime = livePosition;
      }
    } else {
      // Re-align if browser audio drifts more than 2 seconds from the master timeline
      if (Math.abs(el.currentTime - livePosition) > 2) {
        el.currentTime = livePosition;
      }
    }

    if (isPlaying) {
      el.play().catch(() => {
        // Handled: Autoplay policy may require a user click on mobile browsers
      });
    } else {
      el.pause();
    }
  }, [track, isPlaying, livePosition]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1, (state?.volume ?? 75) / 100);
      audioRef.current.muted = Boolean(state?.muted) || browserAudioMuted;
    }
  }, [state?.volume, state?.muted, browserAudioMuted]);

  const activeDeviceObj = state?.audioDevices.find(
    (d) => d.id === state.audioDevice
  );

  return (
    <section className="now-playing-card">
      {track && (
        <div
          className="ambient-backdrop"
          style={{ backgroundImage: `url(${track.thumbnailUrl})` }}
        />
      )}

      <audio ref={audioRef} preload="none" />

      <div className="np-content">
        <div className="np-top-row">
          <div className={`np-artwork-wrap ${isPlaying ? "spinning-glow" : ""}`}>
            {track ? (
              <img
                src={track.thumbnailUrl}
                alt={track.title}
                className="np-artwork"
              />
            ) : (
              <div className="np-artwork-placeholder">
                <Disc3 size={48} className="idle-disc" />
              </div>
            )}
            {track && (
              <span className="source-chip ytmusic">
                {track.source === "ytmusic" ? "YT Music" : "Spotify"}
              </span>
            )}
          </div>

          <div className="np-meta">
            <div className="np-broadcast-row">
              <span className="broadcast-badge live-indicator">
                <Headphones size={13} />
                <span>Synchronized Browser Audio (HQ Stereo)</span>
              </span>

              <button
                type="button"
                className={`preview-toggle ${!browserAudioMuted ? "active" : ""}`}
                onClick={() => setBrowserAudioMuted((v) => !v)}
                title="Mute or unmute music in your local browser tab"
              >
                {!browserAudioMuted ? <Volume2 size={13} /> : <VolumeX size={13} />}
                <span>{!browserAudioMuted ? "Audio: Active" : "Audio: Muted"}</span>
              </button>
            </div>

            {track ? (
              <>
                <div className="np-title-row">
                  <h2 className="np-title" title={track.title}>
                    {track.title}
                  </h2>
                  <a
                    href={track.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="external-link"
                    title="Open on YouTube Music"
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
                <p className="np-artist">
                  {track.artist}
                  {track.album ? ` • ${track.album}` : ""}
                </p>
                <div className="np-requester">
                  Queued by <strong>{track.requestedBy}</strong>{" "}
                  <span className="via-tag">
                    via {track.requestedVia === "root-chat" ? "Root Chat" : "Web UI"}
                  </span>
                </div>
              </>
            ) : (
              <div className="np-empty-copy">
                <h2 className="np-title">Ready to Drop the Beat</h2>
                <p className="np-artist">
                  Search a YouTube Music song below, paste a playlist link, or type{" "}
                  <code>{state?.rootBot.prefix || "/"}play &lt;song&gt;</code> in Root
                  Chat.
                </p>
              </div>
            )}

            {state?.lastError && (
              <div className="np-error-banner">{state.lastError}</div>
            )}
          </div>
        </div>

        {/* Scrubber */}
        <div className="np-scrubber-area">
          <span className="time-label">{formatTime(displayPos)}</span>
          <div className="scrubber-track-wrap">
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
              className="scrubber-slider"
              aria-label="Seek position"
            />
          </div>
          <span className="time-label">{formatTime(duration)}</span>
        </div>

        {/* Transport + Volume */}
        <div className="np-controls-bar">
          <div className="np-secondary-controls">
            <button
              type="button"
              className="icon-btn"
              onClick={onShuffleQueue}
              disabled={!state?.queue.length}
              title="Shuffle upcoming queue"
            >
              <Shuffle size={17} />
            </button>
            <button
              type="button"
              className={`icon-btn ${
                state?.loopMode && state.loopMode !== "off" ? "active" : ""
              }`}
              onClick={() => onCycleLoop(nextLoopMode())}
              title={`Loop mode: ${state?.loopMode || "off"}`}
            >
              {state?.loopMode === "track" ? (
                <Repeat1 size={17} />
              ) : (
                <Repeat size={17} />
              )}
              {state?.loopMode === "queue" && (
                <span className="mini-badge">Q</span>
              )}
            </button>
            <button
              type="button"
              className={`chip-toggle ${state?.autoplay ? "active" : ""}`}
              onClick={() => onToggleAutoplay(!state?.autoplay)}
              title="Automatically play related YouTube Music tracks when the queue ends"
            >
              <Radio size={14} />
              <span>Autoplay</span>
            </button>
          </div>

          <div className="np-primary-controls">
            <button
              type="button"
              className="icon-btn"
              onClick={onPrevious}
              disabled={!track && !state?.history.length}
              title="Previous / Restart"
            >
              <SkipBack size={20} />
            </button>

            <button
              type="button"
              className="play-fab"
              onClick={onTogglePlay}
              disabled={!track && !state?.queue.length}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isLoading ? (
                <Loader2 size={24} className="spin" />
              ) : isPlaying ? (
                <Pause size={24} />
              ) : (
                <Play size={24} style={{ marginLeft: 2 }} />
              )}
            </button>

            <button
              type="button"
              className="icon-btn"
              onClick={onSkip}
              disabled={!track && !state?.queue.length}
              title="Skip track"
            >
              <SkipForward size={20} />
            </button>

            <button
              type="button"
              className="icon-btn subtle"
              onClick={onStop}
              disabled={!track}
              title="Stop playback"
            >
              <Square size={16} />
            </button>
          </div>

          <div className="np-volume-controls">
            <button
              type="button"
              className="icon-btn"
              onClick={() => onMute(!state?.muted)}
              title={state?.muted ? "Unmute" : "Mute"}
            >
              {state?.muted || (state?.volume ?? 0) === 0 ? (
                <VolumeX size={18} />
              ) : (state?.volume ?? 75) < 50 ? (
                <Volume1 size={18} />
              ) : (
                <Volume2 size={18} />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={150}
              value={state?.muted ? 0 : (state?.volume ?? 75)}
              onChange={(e) => onVolume(Number(e.target.value))}
              className="volume-slider"
              aria-label="Volume"
              style={
                {
                  "--progress": `${
                    ((state?.muted ? 0 : (state?.volume ?? 75)) / 150) * 100
                  }%`,
                } as React.CSSProperties
              }
            />
            <span className="vol-pct">
              {state?.muted ? "Muted" : `${state?.volume ?? 75}%`}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
