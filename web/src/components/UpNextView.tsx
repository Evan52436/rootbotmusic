import React, { useState } from "react";
import {
  BookmarkPlus,
  ListMusic,
  Play,
  Shuffle,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { PlayerState, QueueItem, formatTime } from "../types";

interface UpNextViewProps {
  state: PlayerState | null;
  onJumpToItem: (queueId: string) => void;
  onRemoveItem: (queueId: string) => void;
  onShuffle: () => void;
  onClear: () => void;
  onSavePlaylist: (name: string) => void;
}

export const UpNextView: React.FC<UpNextViewProps> = ({
  state,
  onJumpToItem,
  onRemoveItem,
  onShuffle,
  onClear,
  onSavePlaylist,
}) => {
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [playlistName, setPlaylistName] = useState("");

  const currentTrack = state?.currentTrack ?? null;
  const queue = state?.queue ?? [];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistName.trim()) return;
    onSavePlaylist(playlistName.trim());
    setPlaylistName("");
    setShowSaveModal(false);
  };

  const playingFromTitle = currentTrack?.album
    ? currentTrack.album
    : currentTrack?.artist
      ? currentTrack.artist
      : "Community Queue";

  return (
    <div className="up-next-view-root">
      {/* Header Info Matching Screenshot */}
      <div className="up-next-sub-header">
        <div className="playing-from-info">
          <span className="playing-from-label">Playing from</span>
          <span className="playing-from-name" title={playingFromTitle}>
            {playingFromTitle}
          </span>
        </div>

        <div className="up-next-header-actions">
          {queue.length > 1 && (
            <button
              type="button"
              className="queue-action-pill-btn"
              onClick={onShuffle}
              title="Shuffle queue"
            >
              <Shuffle size={14} />
              <span>Shuffle</span>
            </button>
          )}

          <button
            type="button"
            className="queue-action-pill-btn save-btn"
            onClick={() => setShowSaveModal(true)}
            disabled={!currentTrack && queue.length === 0}
            title="Save mix / community playlist"
          >
            <BookmarkPlus size={14} />
            <span>Save</span>
          </button>

          {queue.length > 0 && (
            <button
              type="button"
              className="queue-action-pill-btn clear-btn"
              onClick={onClear}
              title="Clear upcoming queue"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Save Playlist Prompt Modal */}
      {showSaveModal && (
        <form className="save-playlist-prompt-bar" onSubmit={handleSave}>
          <input
            type="text"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            placeholder="Name your playlist..."
            className="save-input"
            autoFocus
          />
          <button type="submit" className="save-submit-btn">
            Save
          </button>
          <button
            type="button"
            className="save-cancel-btn"
            onClick={() => setShowSaveModal(false)}
          >
            <X size={14} />
          </button>
        </form>
      )}

      {/* Track List Matching Screenshot 5 */}
      <div className="up-next-list-container">
        {/* Currently Playing Track row */}
        {currentTrack && (
          <div className="up-next-item current-playing-item">
            <div className="item-thumb-wrapper">
              <img
                src={currentTrack.thumbnailUrl}
                alt={currentTrack.title}
                className="item-thumb-img"
              />
              <div className="playing-speaker-overlay">
                <Volume2 size={16} className="speaker-wave-icon" />
              </div>
            </div>

            <div className="item-details-col">
              <div className="item-title-text" title={currentTrack.title}>
                {currentTrack.title}
              </div>
              <div className="item-artist-text">
                {currentTrack.artist}
                {currentTrack.album ? ` • ${currentTrack.album}` : ""}
              </div>
            </div>

            <div className="item-duration-text">
              {formatTime(currentTrack.durationSec)}
            </div>
          </div>
        )}

        {/* Upcoming Queued Tracks */}
        {queue.length === 0 ? (
          <div className="up-next-empty-state">
            <ListMusic size={32} className="empty-icon" />
            <p className="empty-title">Queue is empty</p>
            <p className="empty-subtitle">
              Use the search bar at the top to search songs or paste links to add.
            </p>
          </div>
        ) : (
          queue.map((item: QueueItem, idx: number) => (
            <div
              key={item.queueId}
              className="up-next-item queued-item"
              onClick={() => onJumpToItem(item.queueId)}
              title={`Click to play: ${item.title}`}
            >
              <div className="item-thumb-wrapper">
                <img
                  src={item.thumbnailUrl}
                  alt={item.title}
                  className="item-thumb-img"
                />
                <div className="hover-play-overlay">
                  <Play size={15} fill="#ffffff" color="#ffffff" />
                </div>
              </div>

              <div className="item-details-col">
                <div className="item-title-text" title={item.title}>
                  {item.title}
                </div>
                <div className="item-artist-text">
                  {item.artist}
                  {item.album ? ` • ${item.album}` : ""}
                </div>
              </div>

              <div className="item-duration-text">
                {formatTime(item.durationSec)}
              </div>

              <button
                type="button"
                className="item-remove-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveItem(item.queueId);
                }}
                title="Remove from queue"
              >
                <X size={15} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
