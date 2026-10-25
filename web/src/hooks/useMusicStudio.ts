import { useCallback, useEffect, useRef, useState } from "react";
import {
  LoopMode,
  MusicSource,
  PlayerState,
  SearchFilter,
  Track,
} from "../types";

export interface ToastNotice {
  id: string;
  message: string;
  tone: "info" | "success" | "error";
}

async function apiRequest<T = any>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function useMusicStudio() {
  const [state, setState] = useState<PlayerState | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [onlineClients, setOnlineClients] = useState(1);
  const [livePosition, setLivePosition] = useState(0);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);

  const [nickname, setNicknameState] = useState<string>(() => {
    return localStorage.getItem("mulyo_nickname") || "Community DJ";
  });

  const setNickname = useCallback((name: string) => {
    const clean = name.trim() || "Community DJ";
    setNicknameState(clean);
    localStorage.setItem("mulyo_nickname", clean);
  }, []);

  const pushToast = useCallback(
    (message: string, tone: ToastNotice["tone"] = "info") => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3600);
    },
    []
  );

  // Sync livePosition whenever state updates
  const lastSyncRef = useRef<{ pos: number; ts: number; playing: boolean }>({
    pos: 0,
    ts: Date.now(),
    playing: false,
  });

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let disposed = false;

    // Initial HTTP fetch so first paint doesn't wait for WS handshake
    apiRequest<PlayerState>("/api/state")
      .then((initial) => {
        if (disposed) return;
        setState(initial);
        setLivePosition(initial.positionSec);
        lastSyncRef.current = {
          pos: initial.positionSec,
          ts: Date.now(),
          playing: initial.status === "playing",
        };
      })
      .catch(() => {});

    const connect = () => {
      if (disposed) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${window.location.host}/ws`);

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "state" && msg.data) {
            const st = msg.data as PlayerState;
            setState(st);
            setLivePosition(st.positionSec);
            lastSyncRef.current = {
              pos: st.positionSec,
              ts: Date.now(),
              playing: st.status === "playing",
            };
          } else if (msg.type === "progress" && msg.data) {
            const { positionSec, durationSec, status } = msg.data;
            setLivePosition(positionSec);
            lastSyncRef.current = {
              pos: positionSec,
              ts: Date.now(),
              playing: status === "playing",
            };
            setState((prev) =>
              prev
                ? {
                    ...prev,
                    positionSec,
                    durationSec: durationSec || prev.durationSec,
                  }
                : prev
            );
          } else if (msg.type === "clients" && typeof msg.count === "number") {
            setOnlineClients(msg.count);
          }
        } catch {
          // ignore invalid message
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!disposed) {
          reconnectTimer = window.setTimeout(connect, 1800);
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  // Smooth 100ms progress interpolation between server ticks
  useEffect(() => {
    const id = window.setInterval(() => {
      const { pos, ts, playing } = lastSyncRef.current;
      if (!playing) return;
      const elapsed = (Date.now() - ts) / 1000;
      setLivePosition((prev) => {
        const next = pos + elapsed;
        if (state?.durationSec && state.durationSec > 0) {
          return Math.min(state.durationSec, next);
        }
        return next > prev ? next : prev;
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [state?.durationSec]);

  // Actions
  const searchTracks = useCallback(
    async (
      query: string,
      source: MusicSource = "ytmusic",
      filter: SearchFilter = "songs"
    ): Promise<Track[]> => {
      const params = new URLSearchParams({ q: query, source, filter });
      const res = await apiRequest<{ tracks: Track[] }>(
        `/api/search?${params.toString()}`
      );
      return res.tracks;
    },
    []
  );

  const addTrack = useCallback(
    async (track: Track, playImmediately = false) => {
      try {
        await apiRequest("/api/queue/add", {
          method: "POST",
          body: JSON.stringify({
            tracks: [track],
            requestedBy: nickname,
            playImmediately,
          }),
        });
        pushToast(
          playImmediately
            ? `Playing "${track.title}" now`
            : `Queued "${track.title}"`,
          "success"
        );
      } catch (err) {
        pushToast((err as Error).message, "error");
      }
    },
    [nickname, pushToast]
  );

  const importQueryOrUrl = useCallback(
    async (
      query: string,
      playImmediately = false,
      source: MusicSource = "ytmusic"
    ) => {
      try {
        const res = await apiRequest<{
          isPlaylist: boolean;
          playlistTitle?: string;
          addedCount: number;
          startedNow?: { title: string };
        }>("/api/queue/add", {
          method: "POST",
          body: JSON.stringify({
            query,
            requestedBy: nickname,
            playImmediately,
            source,
          }),
        });
        if (res.isPlaylist) {
          pushToast(
            `Imported ${res.addedCount} tracks from ${res.playlistTitle || "playlist"}`,
            "success"
          );
        } else {
          pushToast(
            res.startedNow
              ? `Now playing "${res.startedNow.title}"`
              : `Added to queue`,
            "success"
          );
        }
      } catch (err) {
        pushToast((err as Error).message, "error");
      }
    },
    [nickname, pushToast]
  );

  const togglePlayPause = useCallback(async () => {
    try {
      await apiRequest("/api/player/toggle", { method: "POST" });
    } catch (err) {
      pushToast((err as Error).message, "error");
    }
  }, [pushToast]);

  const skip = useCallback(async () => {
    try {
      await apiRequest("/api/player/skip", { method: "POST" });
    } catch (err) {
      pushToast((err as Error).message, "error");
    }
  }, [pushToast]);

  const previous = useCallback(async () => {
    try {
      await apiRequest("/api/player/previous", { method: "POST" });
    } catch (err) {
      pushToast((err as Error).message, "error");
    }
  }, [pushToast]);

  const stop = useCallback(async () => {
    await apiRequest("/api/player/stop", { method: "POST" });
  }, []);

  const seek = useCallback(async (positionSec: number) => {
    setLivePosition(positionSec);
    lastSyncRef.current = {
      pos: positionSec,
      ts: Date.now(),
      playing: lastSyncRef.current.playing,
    };
    await apiRequest("/api/player/seek", {
      method: "POST",
      body: JSON.stringify({ positionSec }),
    });
  }, []);

  const setVolume = useCallback(async (volume: number) => {
    await apiRequest("/api/player/volume", {
      method: "POST",
      body: JSON.stringify({ volume }),
    });
  }, []);

  const setMuted = useCallback(async (muted: boolean) => {
    await apiRequest("/api/player/mute", {
      method: "POST",
      body: JSON.stringify({ muted }),
    });
  }, []);

  const setLoopMode = useCallback(async (mode: LoopMode) => {
    await apiRequest("/api/player/loop", {
      method: "POST",
      body: JSON.stringify({ mode }),
    });
  }, []);

  const setAutoplay = useCallback(
    async (enabled: boolean) => {
      await apiRequest("/api/player/autoplay", {
        method: "POST",
        body: JSON.stringify({ enabled }),
      });
      pushToast(
        enabled ? "Autoplay Radio enabled" : "Autoplay Radio turned off",
        "info"
      );
    },
    [pushToast]
  );

  const jumpToQueueItem = useCallback(async (queueId: string) => {
    await apiRequest("/api/queue/jump", {
      method: "POST",
      body: JSON.stringify({ queueId }),
    });
  }, []);

  const moveQueueItem = useCallback(
    async (fromIndex: number, toIndex: number) => {
      await apiRequest("/api/queue/move", {
        method: "POST",
        body: JSON.stringify({ fromIndex, toIndex }),
      });
    },
    []
  );

  const removeQueueItem = useCallback(async (queueId: string) => {
    await apiRequest(`/api/queue/${encodeURIComponent(queueId)}`, {
      method: "DELETE",
    });
  }, []);

  const shuffleQueue = useCallback(async () => {
    await apiRequest("/api/queue/shuffle", { method: "POST" });
    pushToast("Shuffled upcoming queue", "info");
  }, [pushToast]);

  const clearQueue = useCallback(async () => {
    await apiRequest("/api/queue/clear", { method: "POST" });
    pushToast("Cleared queue", "info");
  }, [pushToast]);

  // Playlists
  const savePlaylist = useCallback(
    async (name: string) => {
      try {
        await apiRequest("/api/playlists", {
          method: "POST",
          body: JSON.stringify({ name, createdBy: nickname }),
        });
        pushToast(`Saved playlist "${name}"`, "success");
      } catch (err) {
        pushToast((err as Error).message, "error");
      }
    },
    [nickname, pushToast]
  );

  const loadPlaylist = useCallback(
    async (id: string, replaceQueue = false) => {
      try {
        const res = await apiRequest<{ count: number }>(
          `/api/playlists/${encodeURIComponent(id)}/load`,
          {
            method: "POST",
            body: JSON.stringify({ requestedBy: nickname, replaceQueue }),
          }
        );
        pushToast(`Queued ${res.count} tracks from playlist`, "success");
      } catch (err) {
        pushToast((err as Error).message, "error");
      }
    },
    [nickname, pushToast]
  );

  const deletePlaylist = useCallback(async (id: string) => {
    await apiRequest(`/api/playlists/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }, []);

  // Audio & Virtual Mic
  const setupVirtualMic = useCallback(async () => {
    try {
      const res = await apiRequest<{ ok: boolean }>(
        "/api/audio/virtual-mic/setup",
        { method: "POST" }
      );
      if (res.ok) {
        pushToast("Virtual Mic active & selected for Root Voice Chat!", "success");
      } else {
        pushToast("Could not enable Virtual Mic automatically", "error");
      }
    } catch (err) {
      pushToast((err as Error).message, "error");
    }
  }, [pushToast]);

  const teardownVirtualMic = useCallback(async () => {
    await apiRequest("/api/audio/virtual-mic/teardown", { method: "POST" });
    pushToast("Virtual Mic disabled; switched to default output", "info");
  }, [pushToast]);

  const setLocalMonitor = useCallback(async (enabled: boolean) => {
    await apiRequest("/api/audio/virtual-mic/monitor", {
      method: "POST",
      body: JSON.stringify({ enabled }),
    });
  }, []);

  const setAudioDevice = useCallback(
    async (deviceId: string) => {
      try {
        await apiRequest("/api/audio/device", {
          method: "POST",
          body: JSON.stringify({ deviceId }),
        });
        pushToast("Switched audio output device", "success");
      } catch (err) {
        pushToast((err as Error).message, "error");
      }
    },
    [pushToast]
  );

  const refreshAudioDevices = useCallback(async () => {
    await apiRequest("/api/audio/refresh", { method: "POST" });
  }, []);

  return {
    state,
    wsConnected,
    onlineClients,
    livePosition,
    nickname,
    setNickname,
    toasts,
    pushToast,
    actions: {
      searchTracks,
      addTrack,
      importQueryOrUrl,
      togglePlayPause,
      skip,
      previous,
      stop,
      seek,
      setVolume,
      setMuted,
      setLoopMode,
      setAutoplay,
      jumpToQueueItem,
      moveQueueItem,
      removeQueueItem,
      shuffleQueue,
      clearQueue,
      savePlaylist,
      loadPlaylist,
      deletePlaylist,
      setupVirtualMic,
      teardownVirtualMic,
      setLocalMonitor,
      setAudioDevice,
      refreshAudioDevices,
    },
  };
}
