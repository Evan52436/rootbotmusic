import React, { useState } from "react";
import { Header } from "./components/Header";
import { NowPlayingStage } from "./components/NowPlayingStage";
import { QueuePanel } from "./components/QueuePanel";
import { SearchPanel } from "./components/SearchPanel";
import { VoiceSetupModal } from "./components/VoiceSetupModal";
import { useMusicStudio } from "./hooks/useMusicStudio";

export const App: React.FC = () => {
  const {
    state,
    wsConnected,
    onlineClients,
    livePosition,
    nickname,
    setNickname,
    toasts,
    actions,
  } = useMusicStudio();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<"audio" | "bot">("audio");

  const openModal = (tab: "audio" | "bot") => {
    setModalTab(tab);
    setModalOpen(true);
  };

  return (
    <div className="app-shell">
      <div className="bg-orb orb-1" aria-hidden="true" />
      <div className="bg-orb orb-2" aria-hidden="true" />

      <Header
        state={state}
        wsConnected={wsConnected}
        onlineClients={onlineClients}
        nickname={nickname}
        onChangeNickname={setNickname}
        onOpenModal={openModal}
      />

      <main className="studio-grid">
        <div className="studio-main-col">
          <NowPlayingStage
            state={state}
            livePosition={livePosition}
            onTogglePlay={() => void actions.togglePlayPause()}
            onSkip={() => void actions.skip()}
            onPrevious={() => void actions.previous()}
            onStop={() => void actions.stop()}
            onSeek={(sec) => void actions.seek(sec)}
            onVolume={(vol) => void actions.setVolume(vol)}
            onMute={(muted) => void actions.setMuted(muted)}
            onCycleLoop={(mode) => void actions.setLoopMode(mode)}
            onToggleAutoplay={(en) => void actions.setAutoplay(en)}
            onShuffleQueue={() => void actions.shuffleQueue()}
            onOpenAudioModal={() => openModal("audio")}
          />

          <SearchPanel
            onSearch={actions.searchTracks}
            onAddTrack={actions.addTrack}
            onImportUrl={actions.importQueryOrUrl}
          />
        </div>

        <QueuePanel
          state={state}
          onJumpToItem={(id) => void actions.jumpToQueueItem(id)}
          onMoveItem={(from, to) => void actions.moveQueueItem(from, to)}
          onRemoveItem={(id) => void actions.removeQueueItem(id)}
          onShuffle={() => void actions.shuffleQueue()}
          onClear={() => void actions.clearQueue()}
          onRequeueTrack={(track, now) => void actions.addTrack(track, now)}
          onSavePlaylist={(name) => void actions.savePlaylist(name)}
          onLoadPlaylist={(id, replace) =>
            void actions.loadPlaylist(id, replace)
          }
          onDeletePlaylist={(id) => void actions.deletePlaylist(id)}
        />
      </main>

      <VoiceSetupModal
        open={modalOpen}
        initialTab={modalTab}
        state={state}
        onClose={() => setModalOpen(false)}
        onSetupVirtualMic={actions.setupVirtualMic}
        onTeardownVirtualMic={actions.teardownVirtualMic}
        onToggleMonitor={actions.setLocalMonitor}
        onSelectDevice={actions.setAudioDevice}
        onRefreshDevices={actions.refreshAudioDevices}
      />

      {/* Toast Stack */}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item toast-${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
