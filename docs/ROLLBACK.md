# Search-first rollback

The previous player composition remains in `src/App.tsx`.

To roll back the new entrypoint without deleting any search-first files:

1. Change `src/main.tsx` to import `App` from `./App`.
2. Render `<App />` instead of `<SearchFirstApp />`.
3. Remove the two `search-first-*.css` imports if the new styling should also be disabled.

Track and Moment storage keys may remain in the browser; the old player ignores the new track-library keys.
