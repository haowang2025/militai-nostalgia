# MilitAIre Nostalgia

A private music memory layer for saving personal Moments while listening.

致敬米哈游的 Olivia Lin：不是替代任何声音，而是给被声音唤起的私人记忆，一个安全沉淀的位置。

## Demo direction

This repository follows `spec_v1.2_part1.md`, `spec_v1.2_part2.md`, and the uploaded `UX.png` reference, but the current demo intentionally narrows the product to the pure memory layer:

- Listen to music and let a moment surface naturally.
- Click or long-press **记住此刻** to create a blank private Moment.
- Edit the Moment directly on the bulletin card with content, tags, and local media hooks.
- Recall multiple saved Moments around their playback time.
- Store everything locally in the browser by default.
- Export a Friday-compatible JSON memory package when the user chooses.

Core promise:

```txt
我不解释你的记忆。
我只帮你把它安全地留下来。
```

## What this demo does not do

This public demo does not interpret, judge, coach, chat, or automatically upload user memory. It is a local-first memory deposit layer.

## Cloudflare Pages

Use these settings:

```txt
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Node version: 20
```

The build copies these root assets into `dist/` after Vite finishes:

- `nilimaoma.mp3`
- `nilimaoma.json`
- `UX.png`

`public/_redirects` is included so `/nostalgia`, `/nostalgia/player/...`, `/nostalgia/library`, and `/nostalgia/settings` all resolve to the SPA entry.

## Local development

```bash
npm install
npm run dev
```

Then open the Vite URL and use:

- `Space` or **记住此刻** to create a blank Moment.
- Long-press **记住此刻** to save an interval Moment.
- Click a Moment card to edit content, tags, and media hooks.
- Use **导出 JSON** to download the current memory package.
- Use `Library` to switch between demo sample entries.
- Use `Settings` to confirm the local-first storage model.

## Data model in this demo

For Cloudflare static deployability, Moments are stored in browser `localStorage`. The exported JSON follows a Friday-compatible shape and keeps the user's private Moment as the primary content. A future server-backed version can move the same structures to:

```txt
data/tracks.json
data/friday/{track_id}.json
data/moments/{track_id}.json
data/config.json
```

## Current scope

Implemented for v0.1 demo:

- Vite + React + TypeScript + Zustand
- UX-style top navigation
- Main player board with real Web Audio spectrogram canvas
- Friday seed-powered candidate bulletin content
- Blank user Moment creation
- Long-press interval Moment capture
- Inline Moment editing
- Local media hooks and thumbnail preview
- Multiple Moment recall on the bulletin board
- Local moment persistence
- Friday-compatible JSON export
- Static Cloudflare Pages deployment

Planned next:

- More real Friday sample tracks
- Schema validation for exported memory packages
- Safer public demo media controls
- Optional server JSON persistence
