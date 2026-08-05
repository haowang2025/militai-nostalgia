# Search-first Local Library v0.3.0

## Goal

Make music search the application entry point, let the user choose a result or automatically open the first result after ten seconds, and keep opened tracks and Moments in browser-local storage without adding an application backend.

## External services

- Search: `GET https://netease-cloud-music-api-sandy-xi.vercel.app/cloudsearch`
- Audio: `https://music.163.com/song/media/outer/url?id={songId}.mp3`

The search API base may be overridden with `VITE_NETEASE_API_BASE`.

## Routes

- `/nostalgia` — search home
- `/nostalgia/player/:trackId` — player and Moment editor
- `/nostalgia/library` — browser-local track library
- `/nostalgia/settings` — storage and network disclosure

## Search flow

- Search by song or artist.
- Normalize up to ten API results through a defensive adapter.
- Start a ten-second countdown after valid results render.
- Cancel auto-open when the user selects a song, starts a new search, leaves the page, hides the document, or presses the cancel button.
- Probe audio metadata for up to twelve seconds before writing the track to local storage.
- Keep results visible and mark the item unavailable when audio loading fails.

## Local data

- Tracks: `militai-nostalgia/tracks/v1`
- Playback state: `militai-nostalgia/playback/v1`
- Moments: `militai-nostalgia/moments/v2`, with v1 migration supplied by the refactor baseline
- Moment media blobs: IndexedDB

Remote MP3 files are not cached.

## Player behavior

- Dynamic tracks do not require Friday JSON.
- When Friday data is absent, the player still supports playback, point Moments, interval Moments, tags, local media attachments, deletion, recall, and JSON export.
- Playback position is persisted every five seconds and when the player pauses, hides, switches track, or unloads.
- The player includes a search drawer and local recent-track shortcuts.
- Remote tracks use a non-blocking decorative spectrum so Web Audio CORS restrictions cannot mute playback.

## Compatibility

- Existing demo tracks remain seeded into the local Library.
- Existing track IDs and Moment associations are unchanged.
- The previous `App.tsx` remains available as a rollback reference.

## Acceptance summary

- Search is the home view.
- The first result automatically opens after ten seconds unless canceled.
- Only successfully probed tracks enter the local Library.
- Library tracks and Moments survive refreshes.
- Each track only displays its own Moments.
- The player can search and switch tracks without an application backend.
- API and audio failures are presented as non-blocking messages.
