# Browser QA checklist

- Search `海阔天空 黄家驹` and confirm up to ten normalized results.
- Confirm the first result countdown starts at ten seconds.
- Confirm selecting another result cancels the countdown.
- Confirm hiding the page cancels automatic selection.
- Confirm a failed audio probe does not add a track to Library.
- Confirm a successful result opens `/nostalgia/player/netease-{id}` paused.
- Confirm point and held interval Moments work without Friday JSON.
- Confirm Moment text, tags, media attachment, deletion, and export.
- Confirm the player search drawer keeps the old track when a new song fails.
- Confirm playback position and track Library survive refresh.
- Confirm existing `nilimaoma` Moments still appear under their original track ID.
- Confirm direct refresh for search, player, Library, and Settings routes on Cloudflare Pages.
