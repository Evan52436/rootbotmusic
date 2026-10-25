# AGENTS.md — AI Handover & Developer Architecture Guide

This document provides complete context, architectural decisions, platform constraints, and Phase 2 instructions so any AI coding agent can immediately pick up work on **Mulyo** without needing prior conversation history.

---

## 1. Project Overview & Product Decisions

**Mulyo** is a Discord-style community **Music Bot** built for the **[Root](https://rootapp.com)** chat platform (`@rootsdk/server-bot`) paired with a **standalone collaborative Web UI Dashboard**.

### Confirmed User Requirements & Design Choices
1. **Bot + Standalone External Web Dashboard (Not an Embedded Root App Channel):**
   - Backend uses `@rootsdk/server-bot` (`^0.21.3`) + `@rootsdk/dev-tools` (`^0.21.3`) to listen for chat commands (`/play`, `/skip`, `/queue`, `/np`, etc.) in Root text channels.
   - A standalone Express + WebSocket + React (Vite) Web Dashboard runs in the **same Node process** (default `http://localhost:3456`) sharing live state with the Root Bot.
2. **Discord-Style Voice Playback via Virtual Microphone:**
   - **Platform Constraint:** Root's SDK (`@rootsdk/server-bot` v0.21.x) only exposes `ChannelWebRtcClient` for moderation (`list`, `kick`, `setMuteAndDeafenOther`) and participant join/leave events — **it does not yet expose a raw PCM/Opus bot voice-channel stream API**.
   - **Solution Implemented:** Mulyo plays audio server-side via `mpv` (JSON IPC) into an isolated PipeWire/PulseAudio null sink (`mulyo_music_sink`) and remaps its monitor into a dedicated **Virtual Microphone** source (`mulyo_music_mic`, description `Mulyo_Music_Bot_Mic`). A Root client account sitting in a Root Voice Channel selects `Mulyo_Music_Bot_Mic` as its Microphone input so everyone in voice chat hears the bot clearly.
   - An optional **Browser Audio Preview** (`GET /api/stream/:sourceId` + `<audio>` toggle in the Web UI) is also included for remote Web UI listeners.
3. **Collaborative Permissions (Open Queue):**
   - Any member in Root Chat or on the Web UI can search, queue tracks, reorder, skip, pause/resume, and save/load community playlists. No DJ-role lockouts are enforced unless requested later.
4. **Phased Music Provider Roadmap:**
   - **Phase 1 (COMPLETED & VERIFIED):** **YouTube Music** (`youtubei.js` Innertube music search + standalone `yt-dlp` binary for URL/playlist resolution & high-bitrate audio streaming + Autoplay Radio via `yt.music.getUpNext`).
   - **Phase 2 (NEXT UP):** **Spotify** track, album, and playlist support (already scaffolded in `src/providers/SpotifyProvider.ts`, `ProviderRegistry.ts`, `.env`, and the Web UI's `Spotify (Phase 2)` tab).

---

## 2. Repository Structure & Module Map

```text
mulyo/
├── root-manifest.json          # Official Root Bot manifest (server.launch -> dist/main.js)
├── package.json                # Backend + workspace root scripts & npm 12 allowScripts
├── tsconfig.json               # Backend TypeScript compiler config (src/ -> dist/)
├── .env / .env.example         # Runtime config (DEV_TOKEN, WEB_PORT, Virtual Mic, Phase 2 Spotify)
├── bin/
│   └── yt-dlp                  # Auto-downloaded standalone yt-dlp binary (gitignored; managed by postinstall)
├── data/
│   └── library.json            # Runtime persisted volume, loopMode, autoplay, preferredAudioDevice & playlists
├── public/                     # Built Vite production bundle served by src/web/WebServer.ts (gitignored)
├── scripts/
│   ├── ensure-ytdlp.mjs        # Postinstall helper: downloads standalone yt-dlp into ./bin/ if missing
│   └── run.mjs                 # Smart launcher: runs `rootsdk start devhost` if DEV_TOKEN is set, else Standalone Mode
├── src/
│   ├── main.ts                 # Entrypoint: initializes MusicController, WebServer, and dynamically loads RootBotHandler
│   ├── config.ts               # Typed .env loader & binary/directory path resolver
│   ├── types/
│   │   └── music.ts            # Core contracts: Track, QueueItem, PlayerState, IMusicProvider, VirtualMicStatus, etc.
│   ├── providers/
│   │   ├── ProviderRegistry.ts     # Routes search & URL resolution across registered providers
│   │   ├── YouTubeMusicProvider.ts # Phase 1: youtubei.js Innertube YT Music search + yt-dlp fallback/playlists/streams
│   │   └── SpotifyProvider.ts      # Phase 2 stub: URL detection (open.spotify.com / spotify:) & env checks
│   ├── audio/
│   │   ├── MpvPlayer.ts            # Persistent mpv daemon controlled via Unix JSON IPC socket (ffplay fallback)
│   │   └── VirtualMicManager.ts    # PipeWire/PulseAudio `pactl` manager for mulyo_music_sink & mulyo_music_mic
│   ├── core/
│   │   └── MusicController.ts      # Central state machine: queue, history, loop, shuffle, autoplay, playlists, events
│   ├── bot/
│   │   └── RootBotHandler.ts       # @rootsdk/server-bot event listeners & text-channel slash/prefix commands
│   └── web/
│       └── WebServer.ts            # Express REST API + WebSocket (/ws) real-time state/progress broadcaster + SPA host
└── web/                        # Standalone Frontend (React 18 + TypeScript + Vite 6 + lucide-react)
    ├── package.json
    ├── vite.config.ts          # Builds into ../public; proxies /api and /ws to localhost:3456 in dev
    └── src/
        ├── types.ts            # Frontend mirror of backend state & Track types
        ├── hooks/
        │   └── useMusicStudio.ts   # WebSocket client (auto-reconnect), 100ms progress interpolation, REST actions
        ├── components/
        │   ├── Header.tsx          # Brand, EQ animation, Voice Mic status pill, Root Bot pill, Nickname editor
        │   ├── NowPlayingStage.tsx # Blurred artwork backdrop, scrubber, transport controls, volume, browser preview
        │   ├── SearchPanel.tsx     # YT Music Songs/Videos search, URL/Playlist import, Spotify Phase 2 tab
        │   ├── QueuePanel.tsx      # Up Next queue (play now, move up/down, remove, shuffle, save mix), Mixes & History
        │   └── VoiceSetupModal.tsx # 1-click Virtual Mic toggle, audio device selector, loopback monitor, Root guide
        └── styles/
            └── index.css       # Custom dark glassmorphic studio theme
```

---

## 3. Critical Gotchas & Environment Rules (READ BEFORE EDITING!)

### 1. `@rootsdk/server-bot` Top-Level Side Effects (DO NOT Statically Import in `main.ts`)
- Importing `@rootsdk/server-bot` executes top-level initialization code that:
  1. Checks `process.env.COMMUNITY_ID` (exiting/failing if absent).
  2. Immediately initializes `knex` + native `sqlite3`.
- When launched via `rootsdk start devhost` (which reads `DEV_TOKEN` from `.env`), `devhost` forks `dist/main.js` with `COMMUNITY_ID` and `BASE_URL` injected into `process.env`.
- When launched in **Standalone Local Mode** (no `DEV_TOKEN` yet), `COMMUNITY_ID` is **not** set.
- **Rule:** Keep `@rootsdk/server-bot` imports confined inside `src/bot/RootBotHandler.ts` (or `src/bot/*`) and load it via `await import("./bot/RootBotHandler")` in `src/main.ts` **only** when `Boolean(process.env.COMMUNITY_ID && process.env.BASE_URL)` is true.

### 2. Node v26 / npm 12 `allowScripts` Policy
- This workspace runs on **Arch Linux** with **Node `v26.12.0`** and **npm `12.2.1`**.
- npm 12 blocks native/postinstall scripts unless listed under `"allowScripts"` in `package.json` (`sqlite3`, `@rootsdk/dev-tools`, `protobufjs`, `utf-8-validate` in root `package.json`; `esbuild` in `web/package.json`).
- **Rule:** Never delete `"allowScripts"` from `package.json` or `web/package.json`. If you install a new package with native bindings or postinstall hooks, run `npm install-scripts approve <pkg> && npm rebuild` (and delete any stray `.npmrc` if created).

### 3. Host Audio Safety During Automated Testing
- The host machine runs **PipeWire (`PulseAudio on PipeWire 1.6.9`)** and may have active speakers or Bluetooth headphones connected.
- **Rule:** When running automated playback tests, **always** verify `AUTO_CREATE_VIRTUAL_MIC=true` so `MpvPlayer` outputs to `pulse/mulyo_music_sink` (the silent null sink) with `monitorLoopbackActive: false`. Never switch `audioDevice` to physical hardware sinks during automated tests.

### 4. `mpv` IPC Event Handling (`MpvPlayer.ts`)
- `mpv` emits `{"event": "end-file", "reason": "..."}` both when a track finishes naturally (`reason: "eof"`) **and** when `loadfile ... replace` replaces a currently playing song (`reason: "stop"`).
- **Rule:** Only emit `trackEnded` on `msg.reason === "eof"`, and preserve `this.loadGeneration` guards so skipping a track never double-advances the queue.

### 5. WebRTC Virtual Microphone Visibility (`VirtualMicManager.ts`)
- Chromium, Electron, and the Root Desktop client hide `.monitor` sources (`mulyo_music_sink.monitor`) from Microphone input dropdowns.
- `VirtualMicManager.ts` loads **two** PulseAudio/PipeWire modules:
  1. `module-null-sink` (`sink_name=mulyo_music_sink`)
  2. `module-remap-source` (`master=mulyo_music_sink.monitor source_name=mulyo_music_mic source_properties=device.description=Mulyo_Music_Bot_Mic`)
- Keep both modules paired so `Mulyo_Music_Bot_Mic` always appears as a genuine Microphone Input in Root.

### 6. Process Cleanup Tip
- When terminating background test processes via shell, use character-class escaping (`pkill -f "[d]ist/main.js"`, `pkill -f "[m]ulyo-mpv"`) so `pkill -f` does not match its own subshell command string.

---

## 4. Build, Run & Verification Commands

```bash
# Install dependencies (also auto-downloads ./bin/yt-dlp if missing)
npm install
npm --prefix web install

# Type-check & build both backend (dist/) and frontend SPA (public/)
npm run build

# Start Mulyo (uses `rootsdk start devhost` if DEV_TOKEN is in .env, otherwise Standalone Mode)
npm start

# Frontend-only Vite HMR dev server on http://localhost:5173 (proxies /api & /ws to :3456)
npm run dev:web

# Explicit Root SDK DevHost launch (requires valid DEV_TOKEN in .env)
npm run bot
```

### Key HTTP & WebSocket Endpoints (`src/web/WebServer.ts`)
- `GET /api/health` & `GET /api/state` — Full `PlayerState` JSON snapshot.
- `WS /ws` — Pushes `{ type: "state", data }`, `{ type: "progress", data: { positionSec, durationSec, status } }`, and `{ type: "clients", count }`.
- `GET /api/search?q=<query>&source=ytmusic&filter=songs|videos` — Search catalog or resolve pasted URL.
- `POST /api/queue/add` — `{ tracks?: Track[], query?: string, requestedBy?: string, playImmediately?: boolean, source?: "ytmusic" | "spotify" }`.
- `POST /api/queue/jump`, `POST /api/queue/move`, `DELETE /api/queue/:queueId`, `POST /api/queue/shuffle`, `POST /api/queue/clear`.
- `POST /api/player/toggle|pause|resume|skip|previous|stop|seek|volume|mute|loop|autoplay`.
- `POST /api/playlists`, `POST /api/playlists/:id/load`, `DELETE /api/playlists/:id`.
- `POST /api/audio/virtual-mic/setup|teardown|monitor`, `POST /api/audio/device`, `POST /api/audio/refresh`.
- `GET /api/stream/:sourceId` — Redirects to resolved direct audio stream URL for optional in-browser playback.

---

## 5. Phase 2 Handover Blueprint: Adding Spotify Support

Everything is pre-wired so **Phase 2 (Spotify)** slots cleanly into the existing architecture without refactoring Queue, Audio, Bot, or WebSocket state.

### How Spotify Playback Should Work
Spotify's Web API does not serve raw full-track audio streams via server Client Credentials. Follow the proven Discord music-bot bridge pattern:
1. **Metadata & Catalog Layer (`SpotifyProvider`):**
   - Authenticate against Spotify Web API (`https://accounts.spotify.com/api/token` using `client_credentials` grant with `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` from `src/config.ts`, caching the bearer token in memory until `expires_in - 60s`).
   - Optional bonus: For public `open.spotify.com` links when credentials aren't configured yet, you can optionally support fallback embed/oEmbed metadata extraction (`https://open.spotify.com/embed/track/...`) or require `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET`.
   - Implement `search(query, filter, limit)` via `GET https://api.spotify.com/v1/search?type=track&q=...` returning `Track[]` with:
     - `source: "spotify"`
     - `sourceId: spotifyTrack.id`
     - `id: "spotify:" + spotifyTrack.id`
     - `isrc: spotifyTrack.external_ids?.isrc`
     - `title`, `artist`, `album`, `durationSec` (`Math.round(duration_ms / 1000)`), `thumbnailUrl` (`album.images[0]?.url`), `externalUrl` (`external_urls.spotify`).
   - Implement `resolveUrl(url)` supporting:
     - `open.spotify.com/track/:id` (`spotify:track:...`)
     - `open.spotify.com/album/:id` (`spotify:album:...`)
     - `open.spotify.com/playlist/:id` (`spotify:playlist:...`, paginating up to 100–200 items)
     - Note: Also handle Spotify's regional `/intl-xx/track/:id` URL path prefix!
2. **Lazy Audio Stream Resolution (`SpotifyProvider.getStreamSource(track)`):**
   - **Important:** Resolve the playable YouTube Music stream **lazily inside `getStreamSource(track)`** when the track actually starts playing (never resolve 100 YouTube streams upfront when importing a 100-track Spotify playlist!).
   - Pass a reference to `YouTubeMusicProvider` into `SpotifyProvider`'s constructor in `src/providers/ProviderRegistry.ts`.
   - Inside `SpotifyProvider.getStreamSource(track)`:
     1. First, if `track.isrc` is present, search `ytMusic.search(track.isrc, "songs", 3)` and verify title/artist/duration proximity.
     2. Otherwise (or if ISRC yields no close match), search `ytMusic.search(`${track.artist} - ${track.title}`, "songs", 5)` and pick the closest duration match (`Math.abs(candidate.durationSec - track.durationSec) <= 15` preferred).
     3. Cache the resolved YouTube `videoId` on an internal `Map<string, string>` (`spotifyId -> ytVideoId`) and return `{ inputUrl: "https://www.youtube.com/watch?v=" + ytVideoId }`.
3. **Frontend & Bot Updates for Phase 2:**
   - **`web/src/components/SearchPanel.tsx`**:
     - Pass `providers` (`state?.providers`) into `SearchPanel`.
     - When the `spotify` provider has `enabled: true` (or if zero-key URL paste is supported), unlock the search bar & results list under the **Spotify** tab instead of rendering `.spotify-phase2-card` (or show a setup prompt in `.spotify-phase2-card` only when `SPOTIFY_CLIENT_ID` is missing!).
   - **`web/src/components/NowPlayingStage.tsx` & `web/src/styles/index.css`**:
     - Update `<span className={`source-chip ${track.source}`}>` and add `.source-chip.spotify { background: rgba(30, 215, 96, 0.9); color: #052e16; }` so Spotify tracks display a green Spotify badge on the Now Playing cover.
   - **`src/web/WebServer.ts` (`GET /api/stream/:sourceId`)**:
     - If browser audio preview is used with a Spotify track, allow passing `?source=spotify&title=...&artist=...` or resolving by track ID so browser preview works for Spotify tracks too.
   - **`src/core/MusicController.ts` (`handleTrackFinished` Autoplay)**:
     - Allow Autoplay Radio to also work after a Spotify track finishes (either via Spotify `/v1/recommendations` or resolving the bridged YT Music video ID's `getRelatedTracks`).
   - **`src/bot/RootBotHandler.ts`**:
     - `/play <open.spotify.com/...>` will work **automatically** once `SpotifyProvider.resolveUrl` and `getStreamSource` are implemented, because `MusicController.playQueryOrUrl` already delegates URL detection to `ProviderRegistry.detectUrlProvider()`! Optionally add `/spotify <query>` if explicit Spotify text search from Root Chat is desired.
