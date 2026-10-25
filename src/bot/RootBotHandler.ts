import {
  ChannelGuid,
  ChannelMessageCreatedEvent,
  ChannelMessageEvent,
  ChannelWebRtcEvent,
  MessageType,
  RootApiException,
  RootBotStartState,
  UserGuid,
  rootServer,
} from "@rootsdk/server-bot";
import { config } from "../config";
import { MusicController } from "../core/MusicController";
import { LoopMode, QueueItem } from "../types/music";

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return "LIVE";
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function buildProgressBar(pos: number, dur: number, size = 14): string {
  if (!dur || dur <= 0) return "🔘" + "─".repeat(size - 1);
  const ratio = Math.max(0, Math.min(1, pos / dur));
  const knob = Math.min(size - 1, Math.round(ratio * (size - 1)));
  return (
    "━".repeat(knob) + "🔘" + "─".repeat(Math.max(0, size - 1 - knob))
  );
}

function parseTimeArg(raw: string): number | null {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const parts = trimmed.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export async function startRootBot(music: MusicController): Promise<void> {
  let lastActiveChannelId: ChannelGuid | null = null;
  const activeVoiceUsers = new Set<string>();

  async function sendChannelReply(
    channelId: ChannelGuid,
    content: string
  ): Promise<void> {
    try {
      await rootServer.community.channelMessages.create({
        channelId,
        content,
      });
    } catch (err) {
      if (err instanceof RootApiException) {
        console.error("[RootBot] RootApiException:", err.errorCode);
      } else {
        console.error("[RootBot] Failed to send channel message:", err);
      }
    }
  }

  async function resolveMemberName(userId: UserGuid): Promise<string> {
    try {
      const member = await rootServer.community.communityMembers.get({
        userId,
      });
      return member?.nickname || "Root Member";
    } catch {
      return "Root Member";
    }
  }

  async function handleCommand(evt: ChannelMessageCreatedEvent): Promise<void> {
    if (evt.messageType === MessageType.System) return;
    if ((evt.userId as string) === (rootServer.appId as string)) return;

    const text = (evt.messageContent || "").trim();
    if (!text) return;

    const prefixes = Array.from(new Set([config.botPrefix, "/", "!"]));
    const matchedPrefix = prefixes.find((p) => text.startsWith(p));
    if (!matchedPrefix) return;

    const withoutPrefix = text.slice(matchedPrefix.length).trim();
    if (!withoutPrefix) return;

    const spaceIdx = withoutPrefix.indexOf(" ");
    const cmd = (
      spaceIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, spaceIdx)
    ).toLowerCase();
    const arg =
      spaceIdx === -1 ? "" : withoutPrefix.slice(spaceIdx + 1).trim();

    const recognized = new Set([
      "play",
      "p",
      "playnow",
      "pause",
      "resume",
      "skip",
      "s",
      "next",
      "prev",
      "back",
      "stop",
      "queue",
      "q",
      "np",
      "nowplaying",
      "volume",
      "vol",
      "v",
      "seek",
      "loop",
      "shuffle",
      "clear",
      "remove",
      "rm",
      "autoplay",
      "mic",
      "web",
      "dashboard",
      "ui",
      "musichelp",
      "help",
    ]);
    if (!recognized.has(cmd)) return;

    lastActiveChannelId = evt.channelId;
    music.updateRootBotStatus({ lastCommandAt: Date.now() });

    const requester = await resolveMemberName(evt.userId);

    try {
      switch (cmd) {
        case "play":
        case "p":
        case "playnow": {
          if (!arg) {
            await music.resume();
            await sendChannelReply(
              evt.channelId,
              `▶️ Resumed playback. Usage: \`${config.botPrefix}play <song name or YouTube Music URL>\``
            );
            return;
          }

          await rootServer.community.channelMessages
            .setTypingIndicator({ channelId: evt.channelId, isTyping: true })
            .catch(() => {});

          const res = await music.playQueryOrUrl(arg, {
            requestedBy: requester,
            requestedVia: "root-chat",
            playImmediately: cmd === "playnow",
          });

          await rootServer.community.channelMessages
            .setTypingIndicator({ channelId: evt.channelId, isTyping: false })
            .catch(() => {});

          if (res.isPlaylist) {
            await sendChannelReply(
              evt.channelId,
              `📚 Queued **${res.added.length}** tracks from **${res.playlistTitle || "Playlist"}** (requested by **${requester}**).\n🎛️ Web UI: ${config.publicWebUrl}`
            );
          } else if (res.startedNow) {
            const t = res.startedNow;
            await sendChannelReply(
              evt.channelId,
              `🎵 **Now Playing:** **${t.title}** — *${t.artist}* \`[${formatDuration(t.durationSec)}]\` (requested by **${requester}**)`
            );
          } else if (res.added[0]) {
            const t = res.added[0];
            const state = music.getState();
            await sendChannelReply(
              evt.channelId,
              `➕ **Added to Queue (#${state.queue.length}):** **${t.title}** — *${t.artist}* \`[${formatDuration(t.durationSec)}]\` (requested by **${requester}**)`
            );
          }
          break;
        }

        case "pause": {
          await music.pause();
          await sendChannelReply(evt.channelId, `⏸️ Paused by **${requester}**.`);
          break;
        }

        case "resume": {
          await music.resume();
          await sendChannelReply(evt.channelId, `▶️ Resumed by **${requester}**.`);
          break;
        }

        case "skip":
        case "s":
        case "next": {
          const next = await music.skip();
          if (next) {
            await sendChannelReply(
              evt.channelId,
              `⏭️ Skipped! Now playing: **${next.title}** — *${next.artist}* \`[${formatDuration(next.durationSec)}]\``
            );
          } else {
            await sendChannelReply(
              evt.channelId,
              `⏭️ Skipped! The queue is now empty.`
            );
          }
          break;
        }

        case "prev":
        case "back": {
          const prev = await music.previous();
          if (prev) {
            await sendChannelReply(
              evt.channelId,
              `⏮️ Playing previous: **${prev.title}** — *${prev.artist}*`
            );
          } else {
            await sendChannelReply(evt.channelId, `ℹ️ No previous track in history.`);
          }
          break;
        }

        case "stop": {
          await music.stop();
          await sendChannelReply(evt.channelId, `⏹️ Stopped playback.`);
          break;
        }

        case "np":
        case "nowplaying": {
          const st = music.getState();
          if (!st.currentTrack) {
            await sendChannelReply(
              evt.channelId,
              `🔇 Nothing is playing right now. Queue a song with \`${config.botPrefix}play <song>\` or open ${config.publicWebUrl}`
            );
            return;
          }
          const t = st.currentTrack;
          const bar = buildProgressBar(st.positionSec, st.durationSec);
          const statusIcon = st.status === "paused" ? "⏸️" : "▶️";
          await sendChannelReply(
            evt.channelId,
            `${statusIcon} **${t.title}** — *${t.artist}*\n` +
              `\`${bar}\` \`${formatDuration(st.positionSec)} / ${formatDuration(st.durationSec)}\`\n` +
              `🔊 Vol: \`${st.volume}%\` • 🔁 Loop: \`${st.loopMode}\` • 🎙️ Mic: \`${st.virtualMic.active ? st.virtualMic.micDescription : st.audioDevice}\`\n` +
              `👤 Requested by **${t.requestedBy}** • 🎛️ ${config.publicWebUrl}`
          );
          break;
        }

        case "queue":
        case "q": {
          const st = music.getState();
          const lines: string[] = [];
          if (st.currentTrack) {
            lines.push(
              `▶️ **Now:** **${st.currentTrack.title}** — *${st.currentTrack.artist}* \`[${formatDuration(st.positionSec)}/${formatDuration(st.durationSec)}]\` *(by ${st.currentTrack.requestedBy})*`
            );
          } else {
            lines.push(`🔇 **Now:** *Nothing playing*`);
          }

          if (st.queue.length === 0) {
            lines.push(`\n*Up Next queue is empty.*`);
          } else {
            lines.push(`\n**Up Next (${st.queue.length} tracks):**`);
            st.queue.slice(0, 10).forEach((item: QueueItem, idx: number) => {
              lines.push(
                `\`${idx + 1}.\` **${item.title}** — *${item.artist}* \`[${formatDuration(item.durationSec)}]\` *(by ${item.requestedBy})*`
              );
            });
            if (st.queue.length > 10) {
              lines.push(`*...and ${st.queue.length - 10} more on ${config.publicWebUrl}*`);
            }
          }
          await sendChannelReply(evt.channelId, lines.join("\n"));
          break;
        }

        case "volume":
        case "vol":
        case "v": {
          if (!arg) {
            const st = music.getState();
            await sendChannelReply(
              evt.channelId,
              `🔊 Current volume is **${st.volume}%**.`
            );
            return;
          }
          const vol = parseInt(arg, 10);
          if (Number.isNaN(vol) || vol < 0 || vol > 150) {
            await sendChannelReply(
              evt.channelId,
              `⚠️ Please specify a volume between \`0\` and \`150\`.`
            );
            return;
          }
          await music.setVolume(vol);
          await sendChannelReply(
            evt.channelId,
            `🔊 Volume set to **${vol}%** by **${requester}**.`
          );
          break;
        }

        case "seek": {
          const sec = parseTimeArg(arg);
          if (sec === null) {
            await sendChannelReply(
              evt.channelId,
              `⚠️ Usage: \`${config.botPrefix}seek 1:30\` or \`${config.botPrefix}seek 90\``
            );
            return;
          }
          await music.seek(sec);
          await sendChannelReply(
            evt.channelId,
            `⏩ Seeked to **${formatDuration(sec)}**.`
          );
          break;
        }

        case "loop": {
          const current = music.getState().loopMode;
          let nextMode: LoopMode;
          if (arg === "off" || arg === "track" || arg === "queue") {
            nextMode = arg;
          } else {
            nextMode =
              current === "off"
                ? "queue"
                : current === "queue"
                  ? "track"
                  : "off";
          }
          music.setLoopMode(nextMode);
          await sendChannelReply(
            evt.channelId,
            `🔁 Loop mode set to **${nextMode}**.`
          );
          break;
        }

        case "autoplay": {
          const next = arg
            ? arg.toLowerCase() === "on" || arg.toLowerCase() === "true"
            : !music.getState().autoplay;
          music.setAutoplay(next);
          await sendChannelReply(
            evt.channelId,
            `📻 Autoplay Radio is now **${next ? "ON" : "OFF"}**.`
          );
          break;
        }

        case "shuffle": {
          music.shuffleQueue();
          await sendChannelReply(
            evt.channelId,
            `🔀 Shuffled the upcoming queue!`
          );
          break;
        }

        case "remove":
        case "rm": {
          const idx = parseInt(arg, 10) - 1;
          if (Number.isNaN(idx) || idx < 0) {
            await sendChannelReply(
              evt.channelId,
              `⚠️ Usage: \`${config.botPrefix}remove <position>\``
            );
            return;
          }
          const removed = music.removeFromQueue(idx);
          if (!removed) {
            await sendChannelReply(
              evt.channelId,
              `⚠️ No track at position #${idx + 1}.`
            );
            return;
          }
          await sendChannelReply(
            evt.channelId,
            `🗑️ Removed **${removed.title}** from queue.`
          );
          break;
        }

        case "clear": {
          music.clearQueue();
          await sendChannelReply(
            evt.channelId,
            `🧹 Cleared the upcoming queue.`
          );
          break;
        }

        case "mic": {
          const micStatus = await music.setupVirtualMicAndSelect();
          if (micStatus.active) {
            await sendChannelReply(
              evt.channelId,
              `🎙️ **Virtual Mic Active!** Select **\`${micStatus.micDescription}\`** as the Microphone input in Root Voice Settings so everyone in voice chat hears the bot.`
            );
          } else {
            await sendChannelReply(
              evt.channelId,
              `ℹ️ Virtual Mic status: ${micStatus.error || "Not active"} — configure audio output at ${config.publicWebUrl}`
            );
          }
          break;
        }

        case "web":
        case "dashboard":
        case "ui": {
          await sendChannelReply(
            evt.channelId,
            `🎛️ **Mulyo Music Web Dashboard:** ${config.publicWebUrl}\nSearch YouTube Music, manage the live queue collaboratively, and control voice mic routing!`
          );
          break;
        }

        case "help":
        case "musichelp": {
          const p = config.botPrefix;
          await sendChannelReply(
            evt.channelId,
            [
              `🎧 **Mulyo Music Bot — Commands**`,
              `• \`${p}play <song or YT Music URL>\` — Play or queue from YouTube Music`,
              `• \`${p}playnow <song>\` — Play immediately`,
              `• \`${p}pause\` / \`${p}resume\` / \`${p}stop\` — Playback controls`,
              `• \`${p}skip\` / \`${p}prev\` / \`${p}seek 1:30\` — Track navigation`,
              `• \`${p}np\` — Show Now Playing & progress bar`,
              `• \`${p}queue\` / \`${p}shuffle\` / \`${p}remove <#>\` / \`${p}clear\` — Queue controls`,
              `• \`${p}vol <0-150>\` / \`${p}loop <off|track|queue>\` / \`${p}autoplay\` — Audio settings`,
              `• \`${p}mic\` — Verify/enable Virtual Mic routing for Root Voice Chat`,
              `• \`${p}web\` — Open the Collaborative Web Dashboard (${config.publicWebUrl})`,
            ].join("\n")
          );
          break;
        }
      }
    } catch (err) {
      await rootServer.community.channelMessages
        .setTypingIndicator({ channelId: evt.channelId, isTyping: false })
        .catch(() => {});
      const message = (err as Error)?.message || String(err);
      await sendChannelReply(evt.channelId, `❌ ${message}`);
    }
  }

  async function onStarting(_state: RootBotStartState): Promise<void> {
    rootServer.community.channelMessages.on(
      ChannelMessageEvent.ChannelMessageCreated,
      (evt) => {
        void handleCommand(evt);
      }
    );

    rootServer.community.channelWebRtcs.on(
      ChannelWebRtcEvent.ChannelWebRtcUserAttach,
      (evt) => {
        activeVoiceUsers.add(`${evt.channelId}:${evt.userId}`);
        music.updateRootBotStatus({
          voiceParticipantsCount: activeVoiceUsers.size,
        });
      }
    );

    rootServer.community.channelWebRtcs.on(
      ChannelWebRtcEvent.ChannelWebRtcUserDetach,
      (evt) => {
        activeVoiceUsers.delete(`${evt.channelId}:${evt.userId}`);
        music.updateRootBotStatus({
          voiceParticipantsCount: activeVoiceUsers.size,
        });
      }
    );

    let communityName: string | undefined;
    try {
      const community = await rootServer.community.communities.get();
      communityName = community?.name;
    } catch {
      // community.get permission might not be enabled yet
    }

    music.updateRootBotStatus({
      connected: true,
      mode: "root-devhost",
      communityName,
      botAppId: String(rootServer.appId || ""),
      error: undefined,
    });

    // Optional: announce auto-advanced tracks when a channel is active
    music.on("trackStarted", (track: QueueItem) => {
      if (lastActiveChannelId && track.requestedBy === "Autoplay Radio") {
        void sendChannelReply(
          lastActiveChannelId,
          `📻 **Autoplay Radio:** **${track.title}** — *${track.artist}* \`[${formatDuration(track.durationSec)}]\``
        );
      }
    });

    console.log(
      `[RootBot] Connected to Root${communityName ? ` community "${communityName}"` : ""}! Listening for ${config.botPrefix}play commands.`
    );
  }

  await rootServer.lifecycle.start(onStarting);
}
