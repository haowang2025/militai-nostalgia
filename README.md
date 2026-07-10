# MilitAIre Nostalgia

A local-first music memory layer for saving private Moments while listening.

> 我不解释你的记忆。  
> 我只帮你把它留下来。

## Current product scope

- Play a local demo track with Friday segment metadata.
- Press or hold **记住此刻** to create a point or interval Moment.
- Use the `Space` key for the same short-press/long-press interaction.
- Edit text, tags, and local media directly on a Moment card.
- Recall multiple Moments around their playback ranges.
- Export a Friday-compatible JSON metadata package.

The app does not interpret, judge, coach, chat, or automatically upload private memories.

## Storage and privacy

- Moment text, tags, timing, and media metadata are stored in versioned `localStorage` records.
- Uploaded image, audio, and video blobs are stored in IndexedDB instead of being embedded as Data URLs in `localStorage`.
- Existing `militai-nostalgia/moments/v1` records are migrated to the v2 envelope on first load.
- Local-first does **not** mean encrypted. Clearing site data deletes local records, so important memories should be exported regularly.
- The current JSON export contains media metadata, not the binary IndexedDB files.

## Local development

Requires Node.js 20 or later.

```bash
npm install
npm run dev
```

Quality commands:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run check
```

## Cloudflare Pages

```txt
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Node version: 20
```

`public/_redirects` keeps `/nostalgia`, `/nostalgia/library`, and `/nostalgia/settings` compatible with client-side navigation.

## Architecture

```txt
src/
  features/
    moments/       IndexedDB media persistence and JSON export
    player/        Web Audio graph and keyboard capture hook
    routing/       History API view routing
  validation.ts    Runtime parsing and legacy storage normalization
  store.ts         Versioned Moment state and storage error reporting
  App.tsx          Product composition and React-controlled interactions
```

All keyboard, pointer, progress, anchor, and media-lightbox behavior is implemented through React state and handlers. The previous document-wide DOM adapter scripts have been removed.

## Media limits

The demo accepts image, audio, and video files up to 25 MB each. A production version should additionally provide total quota reporting, portable media-package export, optional local encryption, and explicit backup/restore flows.

## License

AGPL-3.0. See `LICENSE`.
