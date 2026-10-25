import React, { useState } from "react";
import {
  Bot,
  Check,
  Edit3,
  Mic,
  Radio,
  Settings2,
  Users,
  Volume2,
  WifiOff,
} from "lucide-react";
import { PlayerState } from "../types";

interface HeaderProps {
  state: PlayerState | null;
  wsConnected: boolean;
  onlineClients: number;
  nickname: string;
  onChangeNickname: (name: string) => void;
  onOpenModal: (tab: "audio" | "bot") => void;
}

export const Header: React.FC<HeaderProps> = ({
  state,
  wsConnected,
  onlineClients,
  nickname,
  onChangeNickname,
  onOpenModal,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(nickname);

  const isPlaying = state?.status === "playing";
  const isUsingVirtualMic = Boolean(
    state?.virtualMic.active &&
      state?.audioDevice === state?.virtualMic.mpvDeviceId
  );

  const saveName = () => {
    onChangeNickname(draftName);
    setEditingName(false);
  };

  return (
    <header className="studio-header">
      <div className="brand-cluster">
        <div className={`brand-logo ${isPlaying ? "playing" : ""}`}>
          <Radio size={20} />
          <div className="eq-bars" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
        <div>
          <div className="brand-title-row">
            <h1 className="brand-title">Mulyo</h1>
            <span className="brand-tag">Root Music Studio</span>
          </div>
          <p className="brand-subtitle">
            YouTube Music Voice Bot &amp; Collaborative Queue
          </p>
        </div>
      </div>

      <div className="header-pills">
        {/* Voice / Mic Output Pill */}
        <button
          type="button"
          className={`status-pill clickable ${
            isUsingVirtualMic ? "pill-emerald" : "pill-amber"
          }`}
          onClick={() => onOpenModal("audio")}
          title="Configure Voice Chat Virtual Mic & Audio Output"
        >
          {isUsingVirtualMic ? <Mic size={15} /> : <Volume2 size={15} />}
          <span className="pill-dot" />
          <span>
            {isUsingVirtualMic
              ? `Voice Mic: ${state?.virtualMic.micDescription}`
              : "Audio Routing Setup"}
          </span>
          <Settings2 size={14} className="pill-chevron" />
        </button>

        {/* Root Chat Bot Pill */}
        <button
          type="button"
          className={`status-pill clickable ${
            state?.rootBot.connected ? "pill-emerald" : "pill-neutral"
          }`}
          onClick={() => onOpenModal("bot")}
          title="Root Bot Connection & Chat Commands"
        >
          <Bot size={15} />
          <span className="pill-dot" />
          <span>
            {state?.rootBot.connected
              ? `Root Bot: ${state.rootBot.communityName || "Connected"}`
              : "Root Bot: Standalone"}
          </span>
        </button>

        {/* Live Collaborators */}
        <div
          className={`status-pill ${wsConnected ? "pill-subtle" : "pill-danger"}`}
          title={
            wsConnected
              ? `${onlineClients} collaborator(s) viewing dashboard`
              : "Reconnecting to server..."
          }
        >
          {wsConnected ? <Users size={14} /> : <WifiOff size={14} />}
          <span>{wsConnected ? `${onlineClients} online` : "Reconnecting"}</span>
        </div>

        {/* Collaborative Nickname */}
        <div className="nickname-box">
          {editingName ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveName();
              }}
              className="nickname-form"
            >
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                maxLength={24}
                autoFocus
                placeholder="Your nickname..."
              />
              <button type="submit" className="icon-btn tiny" title="Save">
                <Check size={14} />
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="nickname-trigger"
              onClick={() => {
                setDraftName(nickname);
                setEditingName(true);
              }}
              title="Set your display name when queuing songs"
            >
              <span className="avatar-dot">
                {nickname.slice(0, 1).toUpperCase()}
              </span>
              <span className="nickname-text">{nickname}</span>
              <Edit3 size={12} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
