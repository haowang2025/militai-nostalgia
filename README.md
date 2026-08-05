# MilitAIre Nostalgia

A local-first music memory layer for saving private Moments while listening.

> 我不解释你的记忆。  
> 我只帮你把它留下来。

## Current product scope

- Search songs from the configured music-search API proxy.
- Review up to ten song matches, or let the first result open after a ten-second countdown.
- Load remote audio without adding an application backend.
- Save opened tracks, last playback positions, and private Moments in the current browser.
- Press or hold **记住此刻** to create a point or interval Moment.
- Use the `Space` key for the same short-press/long-press interaction.
- Edit text, tags, and local media attachments for each Moment.
- Search and switch tracks from inside the player.
- Reopen previously used tracks from the local Library.
- Export a Friday-compatible JSON metadata package.

The app does not interpret, judge, coach, chat, or automatically upload private memories.

## Search and audio services

Production clients use the same-origin `/api/search` Pages Function. Direct development fallback endpoints and the audio URL pattern are kept inside the API adapter.

A custom search upstream can be configured with:

```bash
VITE_NETEASE_API_BASE=https://your-api.example.com
```

The current remote audio API pattern is:

```txt
https://music.163.com/song/media/outer/url?id={songId}.mp3
```

Search or playback may fail for individual songs because of regional, copyright, CORS, or upstream-service restrictions. A failed song is not added to the local Library.

## Storage and privacy

- Track metadata and playback positions are stored in `militai-nostalgia/tracks/v1` and `militai-nostalgia/playback/v1`.
- Moment text, tags, timing, and media metadata are stored in versioned `localStorage` records.
- Uploaded image, audio, and video blobs are stored in IndexedDB instead of being embedded as Data URLs in `localStorage`.
- Existing `militai-nostalgia/moments/v1` records are migrated to the v2 envelope on first load.
- Remote MP3 files are not cached for offline playback.
- Local-first does **not** mean encrypted. Clearing site data deletes local records, so important memories should be exported regularly.
- The JSON export contains media metadata, not the binary IndexedDB files.

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

`public/_redirects` keeps `/nostalgia`, `/nostalgia/player/...`, `/nostalgia/library`, and `/nostalgia/settings` compatible with client-side navigation.

## Architecture

```txt
src/
  SearchFirstApp.tsx                Search-first routing and local Library shell
  features/
    search/                         Search API adapter, result UI, countdown
    tracks/                         Versioned local track and playback store
    player/                         Dynamic player, search drawer, Moment editor
    moments/                        IndexedDB media persistence and JSON export
  validation.ts                     Runtime parsing and legacy storage normalization
  store.ts                          Versioned Moment state and storage error reporting
```

The previous `App.tsx` implementation remains in the repository as a rollback reference, while `main.tsx` now mounts `SearchFirstApp`.

## Media limits

The app accepts image, audio, and video files up to 25 MB each. A production version should additionally provide total quota reporting, portable media-package export, optional local encryption, and explicit backup/restore flows.

## License

AGPL-3.0. See `LICENSE`.
