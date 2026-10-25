import React, { useState } from "react";
import {
  Bot,
  CheckCircle2,
  Mic,
  MicOff,
  RefreshCw,
  Speaker,
  Terminal,
  X,
} from "lucide-react";
import { PlayerState } from "../types";

interface VoiceSetupModalProps {
  open: boolean;
  initialTab: "audio" | "bot";
  state: PlayerState | null;
  onClose: () => void;
  onSetupVirtualMic: () => Promise<void>;
  onTeardownVirtualMic: () => Promise<void>;
  onToggleMonitor: (enabled: boolean) => Promise<void>;
  onSelectDevice: (deviceId: string) => Promise<void>;
  onRefreshDevices: () => Promise<void>;
}

export const VoiceSetupModal: React.FC<VoiceSetupModalProps> = ({
  open,
  initialTab,
  state,
  onClose,
  onSetupVirtualMic,
  onTeardownVirtualMic,
  onToggleMonitor,
  onSelectDevice,
  onRefreshDevices,
}) => {
  const [tab, setTab] = useState<"audio" | "bot">(initialTab);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    setTab(initialTab);
  }, [initialTab, open]);

  if (!open) return null;

  const vm = state?.virtualMic;
  const p = state?.rootBot.prefix || "/";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div className="modal-tabs">
            <button
              type="button"
              className={`modal-tab ${tab === "audio" ? "active" : ""}`}
              onClick={() => setTab("audio")}
            >
              <Mic size={16} />
              <span>Voice Chat Mic &amp; Audio Routing</span>
            </button>
            <button
              type="button"
              className={`modal-tab ${tab === "bot" ? "active" : ""}`}
              onClick={() => setTab("bot")}
            >
              <Bot size={16} />
              <span>Root Chat Bot &amp; Commands</span>
            </button>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {tab === "audio" ? (
          <div className="modal-body">
            <div
              className={`vm-status-banner ${vm?.active ? "active" : "inactive"}`}
            >
              <div className="vm-status-left">
                {vm?.active ? <CheckCircle2 size={22} /> : <MicOff size={22} />}
                <div>
                  <h4>
                    {vm?.active
                      ? `Virtual Microphone Active: "${vm.micDescription}"`
                      : "Virtual Microphone Inactive"}
                  </h4>
                  <p>
                    {vm?.active
                      ? "Audio is routed cleanly into a dedicated virtual mic ready for Root Voice Chat."
                      : vm?.error ||
                        "Create a virtual microphone to feed music straight into a Root Voice Channel."}
                  </p>
                </div>
              </div>

              {vm?.supported && (
                <div>
                  {vm.active ? (
                    <button
                      type="button"
                      className="action-btn secondary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        await onTeardownVirtualMic();
                        setBusy(false);
                      }}
                    >
                      Disable Mic
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        await onSetupVirtualMic();
                        setBusy(false);
                      }}
                    >
                      Enable Virtual Mic
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="form-group">
              <div className="label-row">
                <label htmlFor="audio-device-select">
                  <Speaker size={15} />
                  <span>Bot Audio Output Target ({state?.audioBackend})</span>
                </label>
                <button
                  type="button"
                  className="mini-action-btn"
                  onClick={() => void onRefreshDevices()}
                >
                  <RefreshCw size={13} />
                  <span>Refresh</span>
                </button>
              </div>
              <select
                id="audio-device-select"
                className="device-select"
                value={state?.audioDevice || "auto"}
                onChange={(e) => void onSelectDevice(e.target.value)}
              >
                {(state?.audioDevices || []).map((dev) => (
                  <option key={dev.id} value={dev.id}>
                    {dev.name} ({dev.id})
                  </option>
                ))}
              </select>
            </div>

            {vm?.supported && vm.active && (
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={Boolean(vm.monitorLoopbackActive)}
                  onChange={(e) => void onToggleMonitor(e.target.checked)}
                />
                <div>
                  <strong>Local Speaker Monitor (Loopback)</strong>
                  <span>
                    Also play the Virtual Mic stream through your local host
                    speakers/headphones while testing.
                  </span>
                </div>
              </label>
            )}

            <div className="setup-steps-box">
              <h5>How to Stream into a Root Voice Channel (Discord Bot Style)</h5>
              <ol>
                <li>
                  Ensure <strong>Mulyo Virtual Mic</strong> is{" "}
                  <strong>Active</strong> and selected above.
                </li>
                <li>
                  Log into a dedicated bot account on the{" "}
                  <strong>Root Desktop or Web client</strong> and join your
                  community&apos;s Voice Channel.
                </li>
                <li>
                  Open <strong>Root Settings → Voice &amp; Audio</strong> and
                  set <strong>Microphone / Input Device</strong> to{" "}
                  <code>{vm?.micDescription || "Mulyo_Music_Bot_Mic"}</code>.
                </li>
                <li>
                  <em>Pro tip:</em> Turn off Noise Suppression &amp; Echo
                  Cancellation on that bot client for full stereo music clarity!
                </li>
              </ol>
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <div
              className={`vm-status-banner ${
                state?.rootBot.connected ? "active" : "neutral"
              }`}
            >
              <div className="vm-status-left">
                <Bot size={22} />
                <div>
                  <h4>
                    {state?.rootBot.connected
                      ? `Connected to Root${
                          state.rootBot.communityName
                            ? ` (${state.rootBot.communityName})`
                            : ""
                        }`
                      : "Running in Standalone Local Mode"}
                  </h4>
                  <p>
                    {state?.rootBot.connected
                      ? `Listening for ${p}play commands in Root text channels.`
                      : "Add your DEV_TOKEN from dev.rootapp.com into .env and restart to connect Root Chat commands."}
                  </p>
                </div>
              </div>
            </div>

            {!state?.rootBot.connected && (
              <div className="setup-steps-box">
                <h5>Connect to Root Chat (@rootsdk/server-bot)</h5>
                <ol>
                  <li>
                    Open the <strong>Root Developer Portal</strong> (
                    <code>https://dev.rootapp.com</code>), create a Bot, and
                    copy its <code>DEV_TOKEN</code>.
                  </li>
                  <li>
                    Paste <code>DEV_TOKEN=your_token_here</code> into{" "}
                    <code>.env</code> in the project root.
                  </li>
                  <li>
                    Restart with <code>npm start</code> (or{" "}
                    <code>npm run bot</code>) — Mulyo automatically launches{" "}
                    <code>rootsdk start devhost</code> alongside this Web UI!
                  </li>
                </ol>
              </div>
            )}

            <div className="commands-grid-section">
              <h5>
                <Terminal size={15} />
                <span>Root Chat Commands</span>
              </h5>
              <div className="commands-grid">
                <div>
                  <code>{p}play &lt;song or URL&gt;</code>
                  <span>Queue from YouTube Music</span>
                </div>
                <div>
                  <code>{p}playnow &lt;song&gt;</code>
                  <span>Play track immediately</span>
                </div>
                <div>
                  <code>{p}skip</code> / <code>{p}prev</code>
                  <span>Next or previous song</span>
                </div>
                <div>
                  <code>{p}pause</code> / <code>{p}resume</code>
                  <span>Pause or resume audio</span>
                </div>
                <div>
                  <code>{p}np</code>
                  <span>Now Playing &amp; progress bar</span>
                </div>
                <div>
                  <code>{p}queue</code> / <code>{p}shuffle</code>
                  <span>View or shuffle queue</span>
                </div>
                <div>
                  <code>{p}vol &lt;0-150&gt;</code>
                  <span>Set output volume</span>
                </div>
                <div>
                  <code>{p}loop &lt;off|track|queue&gt;</code>
                  <span>Change repeat mode</span>
                </div>
                <div>
                  <code>{p}autoplay</code>
                  <span>Toggle YT Music Radio</span>
                </div>
                <div>
                  <code>{p}web</code>
                  <span>Post Web UI link in chat</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
