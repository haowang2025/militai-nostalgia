## Summary

- make search the `/nostalgia` home view
- normalize NetEase cloudsearch results and auto-open the first result after ten seconds
- probe remote audio before saving a track locally
- add a versioned browser-local track Library and playback position store
- support searched tracks without Friday JSON while preserving point/interval Moments, local media, and export
- add in-player search and track switching
- preserve existing demo tracks and Moment storage migration

## Validation

- new TypeScript sources checked against the strict project data model
- search adapter unit tests added
- browser QA checklist added for upstream API/audio behavior

## Stack

This PR targets `refactor/react-storage-quality`. Merge or retarget it after the refactor PR lands.
