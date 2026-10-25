import React, { useState } from "react";
import { LyricsView } from "./components/LyricsView";
import { NowPlayingStage } from "./components/NowPlayingStage";
import { TopSearchBar } from "./components/TopSearchBar";
import { UpNextView } from "./components/UpNextView";
import { useMusicStudio } from "./hooks/useMusicStudio";

export const App: React.FC = () => {
  const {
    state,
    livePosition,
    actions,
  } = useMusicStudio();

  // Right pane tab: only "queue" or "lyrics"
  const [rightPaneTab, setRightPaneTab] = useState<"queue" | "lyrics">("lyrics");

  const currentTrack = state?.currentTrack ?? null;
  const bgArtwork = currentTrack?.thumbnailUrl;

  const handleFocusSearch = () => {
    const inputEl = document.querySelector<HTMLInputElement>(".top-search-input");
    inputEl?.focus();
  };

  return (
    <div className={`lyric-app-container ${currentTrack ? "has-track" : "no-track"}`}>
      {/* Background: Heavily blurred artwork when track is playing; PLAIN WHITE when nothing is playing */}
      {bgArtwork ? (
        <>
          <div
            className="fullscreen-blurred-backdrop"
            style={{ backgroundImage: `url(${bgArtwork})` }}
            aria-hidden="true"
          />
          <div className="backdrop-subtle-overlay" aria-hidden="true" />
        </>
      ) : (
        <div className="fullscreen-plain-white-backdrop" aria-hidden="true" />
      )}

      {/* Top Universal Long Search Bar */}
      <TopSearchBar
        onSearch={actions.searchTracks}
        onAddTrack={actions.addTrack}
        onImportUrl={actions.importQueryOrUrl}
      />

      {/* Main 2-Column Split Stage (50% / 50% in the middle) */}
      <main className="lyric-main-stage">
        {/* Left Pane: Artwork + Song Details Centered Horizontally */}
        <div className="left-now-playing-pane">
          <NowPlayingStage
            state={state}
            livePosition={livePosition}
            onTogglePlay={() => void actions.togglePlayPause()}
            onSkip={() => void actions.skip()}
            onPrevious={() => void actions.previous()}
            onSeek={(sec) => void actions.seek(sec)}
            onVolume={(vol) => void actions.setVolume(vol)}
            onMute={(muted) => void actions.setMuted(muted)}
            onCycleLoop={(mode) => void actions.setLoopMode(mode)}
            onToggleShuffle={() => void actions.shuffleQueue()}
            onOpenSearch={handleFocusSearch}
            onOpenQueue={() => setRightPaneTab("queue")}
          />
        </div>

        {/* Right Pane: Up Next & Lyrics Tabs Selector */}
        <div className="right-lyrics-pane">
          <div className="right-pane-tabs-header">
            <div className="right-pane-tabs-nav">
              <button
                type="button"
                className={`pane-nav-tab ${rightPaneTab === "queue" ? "active" : ""}`}
                onClick={() => setRightPaneTab("queue")}
              >
                UP NEXT
              </button>
              <button
                type="button"
                className={`pane-nav-tab ${rightPaneTab === "lyrics" ? "active" : ""}`}
                onClick={() => setRightPaneTab("lyrics")}
              >
                LYRICS
              </button>
            </div>
          </div>

          <div className="right-pane-content-body">
            {rightPaneTab === "queue" ? (
              <UpNextView
                state={state}
                onJumpToItem={(id) => void actions.jumpToQueueItem(id)}
                onRemoveItem={(id) => void actions.removeQueueItem(id)}
                onShuffle={() => void actions.shuffleQueue()}
                onClear={() => void actions.clearQueue()}
                onSavePlaylist={(name) => void actions.savePlaylist(name)}
              />
            ) : (
              <LyricsView
                track={currentTrack}
                livePosition={livePosition}
                onSeek={(sec) => void actions.seek(sec)}
                fetchLyrics={actions.fetchLyrics}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
