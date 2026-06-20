# MilitAIre Nostalgia

A music memory player for saving private emotional moments as Friday-compatible JSON, with optional MilitAIre vocal feedback.

致敬米哈游的Olivia Lin

## Demo direction

This repository follows `spec_v1.2_part1.md`, `spec_v1.2_part2.md`, and the uploaded `UX.png` reference:

- UX-first light interface: cream background, soft cards, olive-green spectrum and transport controls.
- Spec-first product flow: listen, remember a moment, add emotional context, export Friday-compatible JSON, optionally view MilitAIre-style feedback.
- Sample-first demo data: `nilimaoma.mp3` is the playable sample audio and `nilimaoma.json` drives the public Friday segments.
- Cloudflare-first deployment: static Vite build, no server required for the v0.1 demo.

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

- `Space` to save the current playback moment.
- `Export JSON` to download Friday-compatible memory JSON.
- `Library` to switch between demo sample entries.
- `Settings` to view future LLM/MCP configuration placeholders.

## Data model in this demo

For Cloudflare static deployability, moments are stored in browser `localStorage`. The exported JSON follows the Friday-compatible shape from the spec. The next server-backed version can move the same structures to:

```txt
data/tracks.json
data/friday/{track_id}.json
data/moments/{track_id}.json
data/practice/{session_id}.json
data/config.json
```

## Current scope

Implemented for v0.1 demo:

- Vite + React + TypeScript + Zustand
- UX-style top navigation
- Main player board with spectrogram canvas background
- Public segment card powered by `nilimaoma.json`
- Moment card and progress anchors
- Transport controls and space-key recording
- Local moment persistence
- Friday-compatible JSON export
- Static Cloudflare Pages deployment

Planned next:

- Real server JSON persistence
- Real MediaRecorder practice sessions
- Real MCP endpoint integration
- Real LLM companion response
