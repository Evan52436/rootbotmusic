# Mulyo — Root Chat Music Bot & Collaborative Web Studio

A Discord-style voice music bot and real-time collaborative Web Dashboard built for **[Root](https://rootapp.com)** (`@rootsdk/server-bot`).

- **Phase 1 (Active):** Full **YouTube Music** catalog search (songs & videos), direct URL & playlist importing, collaborative queue, saved community mixes, autoplay radio, Root text-channel bot commands, and **Virtual Microphone voice routing**.
- **Phase 2 (Scaffolded):** **Spotify** track, album, and playlist metadata + ISRC bridge (`src/providers/SpotifyProvider.ts`).

---

## How Voice Audio Works on Root

Because Root's Bot SDK (`@rootsdk/server-bot`) handles text/event channels and does not expose direct bot voice-stream injection yet, Mulyo plays audio just like classic virtual-cable voice bots:

1. **Mulyo's `MpvPlayer` + `VirtualMicManager`** automatically creates an isolated PipeWire/PulseAudio virtual sink (`mulyo_music_sink`) and exposes a dedicated virtual microphone input named **`Mulyo_Music_Bot_Mic`**.
2. Join your Root community's Voice Channel using a dedicated bot account on the Root client and set its **Input / Microphone Device** to **`Mulyo_Music_Bot_Mic`**.
3. Anyone in the community can control the music collaboratively from **Root Chat** (`/play`, `/skip`, `/queue`, `/np`) or from the **Web Dashboard** (`http://localhost:3456`), and everyone in the voice channel hears the live stream!

---

## Quick Start

### 1. Install & Build
```bash
npm install
npm --prefix web install
npm run build
```
*(Note: `npm install` automatically downloads a standalone `yt-dlp` binary into `./bin/yt-dlp` if `yt-dlp` is not already installed globally.)*

### 2. Run Locally (Standalone Web UI + Virtual Mic)
Even before setting up a Root `DEV_TOKEN`, you can launch Mulyo immediately:
```bash
npm start
```
Then open **http://localhost:3456** in your browser!

### 3. Connect to Your Root Community (`DEV_TOKEN`)
1. Go to the **[Root Developer Portal](https://dev.rootapp.com)**, create a **Bot**, and generate a `DEV_TOKEN`.
2. Add it to `.env`:
   ```env
   DEV_TOKEN=your_generated_dev_token_here
   ```
3. Start Mulyo:
   ```bash
   npm start
   # or explicitly via Root SDK DevHost:
   npm run bot
   ```
   When `DEV_TOKEN` is set, `npm start` automatically launches `rootsdk start devhost` alongside the Web Dashboard on `http://localhost:3456`.

---

## Root Chat Commands

| Command | Description |
| :--- | :--- |
| `/play <query or URL>` | Search YouTube Music or import a song / playlist URL |
| `/playnow <query>` | Play a song immediately |
| `/pause` / `/resume` / `/stop` | Control playback |
| `/skip` / `/prev` / `/seek 1:30` | Navigate tracks or seek |
| `/np` | Show Now Playing card & live progress bar |
| `/queue` | View upcoming tracks |
| `/shuffle` / `/remove <#>` / `/clear` | Manage the queue |
| `/vol <0-150>` | Adjust output volume |
| `/loop <off\|track\|queue>` | Cycle repeat mode |
| `/autoplay` | Toggle YouTube Music Autoplay Radio |
| `/mic` | Verify or re-enable `Mulyo_Music_Bot_Mic` |
| `/web` | Post the Web Dashboard URL in chat |
| `/help` | List all commands |
