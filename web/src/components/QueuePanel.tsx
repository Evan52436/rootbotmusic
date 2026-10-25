import React, { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  Clock,
  FolderHeart,
  History,
  ListMusic,
  Play,
  Plus,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";
import { PlayerState, Track, formatTime } from "../types";

interface QueuePanelProps {
  state: PlayerState | null;
  onJumpToItem: (queueId: string) => void;
  onMoveItem: (fromIndex: number, toIndex: number) => void;
  onRemoveItem: (queueId: string) => void;
  onShuffle: () => void;
  onClear: () => void;
  onRequeueTrack: (track: Track, playImmediately: boolean) => void;
  onSavePlaylist: (name: string) => void;
  onLoadPlaylist: (id: string, replaceQueue: boolean) => void;
  onDeletePlaylist: (id: string) => void;
}

export const QueuePanel: React.FC<QueuePanelProps> = ({
  state,
  onJumpToItem,
  onMoveItem,
  onRemoveItem,
  onShuffle,
  onClear,
  onRequeueTrack,
  onSavePlaylist,
  onLoadPlaylist,
  onDeletePlaylist,
}) => {
  const [tab, setTab] = useState<"queue" | "playlists" | "history">("queue");
  const [savingMix, setSavingMix] = useState(false);
  const [mixName, setMixName] = useState("");

  const queue = state?.queue || [];
  const history = state?.history || [];
  const playlists = state?.playlists || [];

  const totalQueueSec = queue.reduce((acc, q) => acc + (q.durationSec || 0), 0);

  const handleSaveMix = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mixName.trim()) return;
    onSavePlaylist(mixName.trim());
    setMixName("");
    setSavingMix(false);
    setTab("playlists");
  };

  return (
    <aside className="panel-card queue-panel">
      <div className="queue-tabs-header">
        <div className="queue-tabs">
          <button
            type="button"
            className={`queue-tab ${tab === "queue" ? "active" : ""}`}
            onClick={() => setTab("queue")}
          >
            <ListMusic size={15} />
            <span>Up Next</span>
            <span className="count-pill">{queue.length}</span>
          </button>

          <button
            type="button"
            className={`queue-tab ${tab === "playlists" ? "active" : ""}`}
            onClick={() => setTab("playlists")}
          >
            <FolderHeart size={15} />
            <span>Mixes</span>
            {playlists.length > 0 && (
              <span className="count-pill">{playlists.length}</span>
            )}
          </button>

          <button
            type="button"
            className={`queue-tab ${tab === "history" ? "active" : ""}`}
            onClick={() => setTab("history")}
          >
            <History size={15} />
            <span>Recent</span>
          </button>
        </div>
      </div>

      {tab === "queue" && (
        <>
          <div className="queue-toolbar">
            <span className="queue-summary">
              <Clock size={13} />
              {queue.length > 0
                ? `${queue.length} track${queue.length === 1 ? "" : "s"} • ${formatTime(totalQueueSec)}`
                : "Collaborative queue"}
            </span>

            <div className="queue-toolbar-actions">
              <button
                type="button"
                className="mini-action-btn"
                disabled={!state?.currentTrack && queue.length === 0}
                onClick={() => setSavingMix((v) => !v)}
                title="Save current session as a community mix"
              >
                <BookmarkPlus size={14} />
                <span>Save</span>
              </button>
              <button
                type="button"
                className="mini-action-btn"
                disabled={queue.length < 2}
                onClick={onShuffle}
                title="Shuffle queue"
              >
                <Shuffle size={14} />
              </button>
              <button
                type="button"
                className="mini-action-btn danger"
                disabled={queue.length === 0}
                onClick={onClear}
                title="Clear upcoming queue"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {savingMix && (
            <form onSubmit={handleSaveMix} className="save-mix-form">
              <input
                type="text"
                value={mixName}
                onChange={(e) => setMixName(e.target.value)}
                placeholder="Name this community mix..."
                maxLength={40}
                autoFocus
              />
              <button type="submit" className="primary-btn small">
                Save Mix
              </button>
              <button
                type="button"
                className="icon-btn tiny"
                onClick={() => setSavingMix(false)}
              >
                <X size={14} />
              </button>
            </form>
          )}

          <div className="queue-list">
            {queue.length === 0 ? (
              <div className="empty-state-box subtle">
                <ListMusic size={26} />
                <p>No upcoming tracks in queue.</p>
                <span className="hint-text">
                  Anyone can add songs from the search bar or with{" "}
                  <code>{state?.rootBot.prefix || "/"}play</code> in Root Chat!
                </span>
              </div>
            ) : (
              queue.map((item, idx) => (
                <div key={item.queueId} className="queue-item-row">
                  <span className="queue-index">{idx + 1}</span>
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    className="queue-thumb"
                    loading="lazy"
                  />
                  <div className="queue-item-meta">
                    <div className="queue-item-title" title={item.title}>
                      {item.title}
                    </div>
                    <div className="queue-item-sub">
                      <span>{item.artist}</span>
                      <span className="dot">•</span>
                      <span className="requester-chip">
                        {item.requestedBy}
                        {item.requestedVia === "root-chat" ? " (Chat)" : ""}
                      </span>
                    </div>
                  </div>
                  <span className="queue-duration">
                    {item.durationSec > 0 ? formatTime(item.durationSec) : ""}
                  </span>
                  <div className="queue-item-controls">
                    <button
                      type="button"
                      className="icon-btn tiny"
                      onClick={() => onJumpToItem(item.queueId)}
                      title="Play this track now"
                    >
                      <Play size={13} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn tiny"
                      disabled={idx === 0}
                      onClick={() => onMoveItem(idx, idx - 1)}
                      title="Move up"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn tiny"
                      disabled={idx === queue.length - 1}
                      onClick={() => onMoveItem(idx, idx + 1)}
                      title="Move down"
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn tiny danger"
                      onClick={() => onRemoveItem(item.queueId)}
                      title="Remove from queue"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {tab === "playlists" && (
        <div className="queue-list">
          {playlists.length === 0 ? (
            <div className="empty-state-box subtle">
              <FolderHeart size={26} />
              <p>No saved community mixes yet.</p>
              <span className="hint-text">
                Queue some songs and click &ldquo;Save&rdquo; in Up Next to save
                reusable playlists!
              </span>
            </div>
          ) : (
            playlists.map((pl) => (
              <div key={pl.id} className="playlist-card">
                <div className="playlist-card-info">
                  <div className="playlist-name">{pl.name}</div>
                  <div className="playlist-meta">
                    {pl.tracks.length} tracks • saved by {pl.createdBy}
                  </div>
                </div>
                <div className="playlist-actions">
                  <button
                    type="button"
                    className="action-btn secondary"
                    onClick={() => onLoadPlaylist(pl.id, false)}
                    title="Append all tracks to queue"
                  >
                    <Plus size={14} />
                    <span>Queue</span>
                  </button>
                  <button
                    type="button"
                    className="action-btn primary"
                    onClick={() => onLoadPlaylist(pl.id, true)}
                    title="Replace queue and play immediately"
                  >
                    <Play size={13} />
                    <span>Play</span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn tiny danger"
                    onClick={() => onDeletePlaylist(pl.id)}
                    title="Delete playlist"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="queue-list">
          {history.length === 0 ? (
            <div className="empty-state-box subtle">
              <History size={26} />
              <p>No recently played songs yet.</p>
            </div>
          ) : (
            history.map((item) => (
              <div key={item.queueId} className="queue-item-row">
                <img
                  src={item.thumbnailUrl}
                  alt={item.title}
                  className="queue-thumb"
                  loading="lazy"
                />
                <div className="queue-item-meta">
                  <div className="queue-item-title" title={item.title}>
                    {item.title}
                  </div>
                  <div className="queue-item-sub">
                    <span>{item.artist}</span>
                    <span className="dot">•</span>
                    <span>by {item.requestedBy}</span>
                  </div>
                </div>
                <div className="queue-item-controls visible">
                  <button
                    type="button"
                    className="action-btn secondary"
                    onClick={() => onRequeueTrack(item, false)}
                    title="Queue again"
                  >
                    <Plus size={14} />
                    <span>Queue</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  );
};
