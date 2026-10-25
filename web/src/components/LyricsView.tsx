import React, { useEffect, useRef, useState } from "react";
import {
  Clock,
  Languages,
  Loader2,
  Maximize2,
  Minimize2,
  Music,
  Sparkles,
} from "lucide-react";
import { LyricLine, LyricsData, Track } from "../types";

interface LyricsViewProps {
  track: Track | null;
  livePosition: number;
  onSeek: (positionSec: number) => void;
  fetchLyrics: (track: Track) => Promise<LyricsData>;
}

export const LyricsView: React.FC<LyricsViewProps> = ({
  track,
  livePosition,
  onSeek,
  fetchLyrics,
}) => {
  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeOffset, setTimeOffset] = useState<number>(0);
  const [isManualScroll, setIsManualScroll] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollTimeoutRef = useRef<number | null>(null);

  // Fetch lyrics when track changes
  useEffect(() => {
    if (!track) {
      setLyricsData(null);
      return;
    }

    let isCancelled = false;
    setLoading(true);
    setTimeOffset(0);

    fetchLyrics(track)
      .then((data) => {
        if (!isCancelled) {
          setLyricsData(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setLyricsData({
            source: "None",
            synced: false,
            lines: [{ text: "Could not load lyrics." }],
          });
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [track?.id, fetchLyrics]);

  const effectivePosition = Math.max(0, livePosition + timeOffset);

  // Determine current active lyric index
  let activeIndex = -1;
  if (lyricsData && lyricsData.lines.length > 0) {
    if (lyricsData.synced) {
      for (let i = 0; i < lyricsData.lines.length; i++) {
        const lineTime = lyricsData.lines[i].time ?? 0;
        if (lineTime <= effectivePosition) {
          activeIndex = i;
        } else {
          break;
        }
      }
    } else {
      // If unsynced, estimate index smoothly from track duration so lyrics always follow!
      const totalDur = track?.durationSec || 180;
      const ratio = Math.min(0.99, Math.max(0, effectivePosition / totalDur));
      activeIndex = Math.min(
        lyricsData.lines.length - 1,
        Math.floor(ratio * lyricsData.lines.length)
      );
    }
  }

  // Auto-scroll to active lyric line: EXACTLY CENTERED VERTICALLY
  useEffect(() => {
    if (activeIndex === -1 || isManualScroll || !containerRef.current) {
      return;
    }

    const activeEl = lineRefs.current[activeIndex];
    const container = containerRef.current;
    if (activeEl && container) {
      const activeRect = activeEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const offsetWithinContainer =
        activeRect.top - containerRect.top + container.scrollTop;
      const targetScroll =
        offsetWithinContainer -
        container.clientHeight / 2 +
        activeEl.clientHeight / 2;

      container.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: "smooth",
      });
    }
  }, [activeIndex, isManualScroll]);

  const handleUserInteraction = () => {
    setIsManualScroll(true);
    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current);
    }
    // Resume auto-scroll 3.5 seconds after user finishes manual scrolling
    scrollTimeoutRef.current = window.setTimeout(() => {
      setIsManualScroll(false);
    }, 3500);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const adjustOffset = (delta: number) => {
    setTimeOffset((prev) => Math.round((prev + delta) * 10) / 10);
  };

  return (
    <div className="lyrics-panel-root">
      <div
        className={`lyrics-scroll-container blyrics-container ${
          isManualScroll ? "blyrics-user-scrolling" : ""
        }`}
        ref={containerRef}
        onWheel={handleUserInteraction}
        onTouchMove={handleUserInteraction}
        onPointerDown={handleUserInteraction}
        data-sync={lyricsData?.synced ? "synced" : "none"}
      >
        <div className="lyrics-content-wrapper">
          <div className="lyrics-lead-icon">
            <Music size={26} />
          </div>

          {loading ? (
            <div className="lyrics-loading-state">
              <Loader2 size={36} className="spin" />
              <p>Searching lyrics (Better Lyrics, LRCLIB, YouTube Music)...</p>
            </div>
          ) : !lyricsData || lyricsData.lines.length === 0 ? (
            <div className="lyrics-empty-state">
              <p>Play a song to view lyrics</p>
            </div>
          ) : (
            <div
              className={`lyrics-lines-list ${
                lyricsData.synced ? "synced-mode" : "unsynced-mode"
              }`}
            >
              {lyricsData.lines.map((line: LyricLine, idx: number) => {
                const isCurrent = idx === activeIndex;
                const isPast = activeIndex !== -1 && idx < activeIndex;
                const distance = idx - activeIndex;

                // Character-weighted word timing for letter-by-letter horizontal sweep effect
                const words = line.text.split(" ");
                const totalChars = words.reduce(
                  (acc, w) => acc + Math.max(1, w.length),
                  0
                );

                const totalTrackDur = track?.durationSec || 180;
                const lineStartTime =
                  line.time !== undefined
                    ? line.time
                    : (idx / Math.max(1, lyricsData.lines.length)) * totalTrackDur;

                const nextLine = lyricsData.lines[idx + 1];
                const lineEndTime =
                  nextLine?.time !== undefined
                    ? nextLine.time
                    : line.time !== undefined
                      ? lineStartTime + Math.max(2.5, words.length * 0.65)
                      : ((idx + 1) / Math.max(1, lyricsData.lines.length)) * totalTrackDur;

                const lineDur = Math.max(0.6, lineEndTime - lineStartTime);

                let charAccum = 0;
                const wordRanges = words.map((w) => {
                  const chars = Math.max(1, w.length);
                  const startRatio = charAccum / totalChars;
                  charAccum += chars;
                  const endRatio = charAccum / totalChars;
                  return {
                    startSec: lineStartTime + startRatio * lineDur,
                    endSec: lineStartTime + endRatio * lineDur,
                    durSec: Math.max(0.1, (endRatio - startRatio) * lineDur),
                  };
                });

                // Calculate distance from active line for top & bottom progressive blur
                let distClass = "";
                if (isCurrent) {
                  distClass = "blyrics--active active-line";
                } else if (isPast) {
                  const absP = Math.abs(distance);
                  if (absP === 1) distClass = "blyrics--past past-line past-1";
                  else if (absP === 2) distClass = "blyrics--past past-line past-2";
                  else if (absP === 3) distClass = "blyrics--past past-line past-3";
                  else distClass = "blyrics--past past-line past-far";
                } else {
                  // Upcoming lines below
                  if (distance === 1) distClass = "blyrics--future future-line dist-1";
                  else if (distance === 2) distClass = "blyrics--future future-line dist-2";
                  else if (distance === 3) distClass = "blyrics--future future-line dist-3";
                  else if (distance === 4) distClass = "blyrics--future future-line dist-4";
                  else distClass = "blyrics--future future-line dist-far";
                }

                return (
                  <div
                    key={idx}
                    ref={(el) => (lineRefs.current[idx] = el)}
                    className={`lyric-line blyrics--line ${distClass}`}
                    onClick={() => {
                      if (line.time !== undefined) {
                        onSeek(line.time - timeOffset);
                        setIsManualScroll(false);
                      }
                    }}
                    title={
                      line.time !== undefined
                        ? `Click to seek to ${Math.floor(line.time / 60)}:${String(
                            Math.floor(line.time % 60)
                          ).padStart(2, "0")}`
                        : undefined
                    }
                  >
                    <div className="blyrics-word-group">
                      {words.map((word, wIdx) => {
                        const range = wordRanges[wIdx];
                        let fillPct = 0;
                        if (isPast) {
                          fillPct = 100;
                        } else if (isCurrent) {
                          if (effectivePosition >= range.endSec) {
                            fillPct = 100;
                          } else if (effectivePosition <= range.startSec) {
                            fillPct = 0;
                          } else {
                            const prog =
                              (effectivePosition - range.startSec) / range.durSec;
                            fillPct = Math.min(
                              100,
                              Math.max(0, Math.round(prog * 100))
                            );
                          }
                        } else {
                          fillPct = 0;
                        }

                        return (
                          <span
                            key={wIdx}
                            className="blyrics--word"
                            style={
                              {
                                "--fill-pct": `${fillPct}%`,
                              } as React.CSSProperties
                            }
                          >
                            {word}
                          </span>
                        );
                      })}
                    </div>
                    {line.secondaryText && (
                      <div className="blyrics--translated">{line.secondaryText}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Floating Status Control Box (A bit square matching request) */}
      {lyricsData && (
        <div className="lyrics-bottom-toolbar">
          <div className="better-lyrics-status-box">
            <span className="source-tag">
              <Sparkles size={13} />
              <span>{lyricsData.source}</span>
            </span>

            <span className="pill-divider">•</span>

            <span className="translate-tag" title="Language / Translation">
              <Languages size={13} />
            </span>

            {lyricsData.synced && (
              <>
                <span className="pill-divider">•</span>
                <span className="clock-tag">
                  <Clock size={12} />
                </span>
                <button
                  type="button"
                  className="offset-btn"
                  onClick={() => adjustOffset(-0.5)}
                  title="Shift lyrics 0.5s earlier"
                >
                  -
                </button>
                <span className="offset-display" title="Manual sync offset">
                  {Math.abs(timeOffset) < 0.05
                    ? "0.0s"
                    : `${timeOffset >= 0 ? "+" : ""}${timeOffset.toFixed(1)}s`}
                </span>
                <button
                  type="button"
                  className="offset-btn"
                  onClick={() => adjustOffset(0.5)}
                  title="Shift lyrics 0.5s later"
                >
                  +
                </button>
              </>
            )}

            <span className="pill-divider">•</span>

            <button
              type="button"
              className="fullscreen-btn"
              onClick={toggleFullscreen}
              title="Toggle Fullscreen"
            >
              {document.fullscreenElement ? (
                <Minimize2 size={13} />
              ) : (
                <Maximize2 size={13} />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
